import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'secToMin',
})
export class SecToMinPipe implements PipeTransform {
  transform(value: number): string {
    const minutes: number = Math.floor(value / 60);
    return (
      minutes.toString() +
      ':' +
      Math.round((value - minutes * 60)).toString().padStart(2, '0')
    );
  }
}
