import { Directive, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';

export type LoopKind = 'heartbeat' | 'rock';

interface LoopDefinition {
  keyframes: Keyframe[];
  duration: number;
  /**
   * How the motion comes back to rest when the loop stops: `finish` plays the
   * current cycle to its end, `rewind` goes back along the same path when that
   * is shorter (first half of the cycle).
   */
  stop: 'finish' | 'rewind';
}

const LOOPS: Record<LoopKind, LoopDefinition> = {
  // Two beats then a rest: the classic heartbeat, scaled down to a gentle 10 %.
  heartbeat: {
    duration: 2000,
    stop: 'finish',
    keyframes: [
      { transform: 'scale(1)', easing: 'ease-in-out', offset: 0 },
      { transform: 'scale(1.1)', easing: 'ease-in-out', offset: 0.14 },
      { transform: 'scale(1)', easing: 'ease-in-out', offset: 0.28 },
      { transform: 'scale(1.1)', easing: 'ease-in-out', offset: 0.42 },
      { transform: 'scale(1)', offset: 0.7 },
      { transform: 'scale(1)', offset: 1 },
    ],
  },
  // Half a turn and back.
  rock: {
    duration: 4000,
    stop: 'rewind',
    keyframes: [
      { transform: 'rotate(0deg)', easing: 'ease-in-out', offset: 0 },
      { transform: 'rotate(180deg)', easing: 'ease-in-out', offset: 0.5 },
      { transform: 'rotate(0deg)', offset: 1 },
    ],
  },
};

/**
 * Plays a looping motion while the bound value is true:
 *   <div [appLoopWhile]="hovered" loop="heartbeat"></div>
 *
 * Unlike toggling an animation state, it never jumps: when the value turns
 * false the motion eases back to rest from wherever it is, and when it turns
 * true again mid-way it carries on from there. It runs on the Web Animations
 * API, outside Angular's change detection, and stays still for people who ask
 * their system for reduced motion.
 */
@Directive({
  selector: '[appLoopWhile]',
  standalone: false,
})
export class LoopWhileDirective implements OnDestroy {
  private element: HTMLElement = inject(ElementRef).nativeElement;
  private zone = inject(NgZone);
  private animation?: Animation;

  @Input() loop: LoopKind = 'heartbeat';

  @Input() set appLoopWhile(active: boolean) {
    if (!canAnimate(this.element)) return;
    this.zone.runOutsideAngular(() => (active ? this.start() : this.stop()));
  }

  private start(): void {
    const animation = this.animation;
    if (!animation) {
      const { keyframes, duration } = LOOPS[this.loop];
      this.animation = this.element.animate(keyframes, { duration, iterations: Infinity });
      return;
    }
    // Coming back while it was settling: carry on from the current pose.
    if (animation.playbackRate < 0) animation.reverse();
    animation.effect?.updateTiming({ iterations: Infinity });
    if (animation.playState !== 'running') animation.play();
  }

  private stop(): void {
    const animation = this.animation;
    if (!animation?.effect || animation.playState !== 'running' || animation.playbackRate < 0) return;
    const { duration, stop } = LOOPS[this.loop];
    const { currentIteration, progress } = animation.effect.getComputedTiming();
    if (currentIteration == null || progress == null) return;

    if (stop === 'rewind' && progress < 0.5) {
      // Go back the way it came. Moved to the same point of the first cycle (same
      // pose, nothing visible) so that playing backwards ends at the start.
      animation.currentTime = progress * duration;
      animation.effect.updateTiming({ iterations: 1 });
      animation.reverse();
    } else {
      // Ends with the current cycle, at rest.
      animation.effect.updateTiming({ iterations: currentIteration + 1 });
    }
    animation.onfinish = () => {
      // Not if the loop was restarted in the meantime.
      if (this.animation === animation && animation.playState === 'finished') {
        animation.cancel();
        this.animation = undefined;
      }
    };
  }

  ngOnDestroy(): void {
    this.animation?.cancel();
  }
}

function canAnimate(element: HTMLElement): boolean {
  if (typeof element.animate !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
