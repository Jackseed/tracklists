import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { AuthService, User } from '../+state';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  form: FormGroup;
  user$: Observable<User>;
  type: 'login' | 'signup' | 'reset' = 'signup';
  loading = false;

  constructor(
    public service: AuthService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private analytics: AngularFireAnalytics,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.minLength(6), Validators.required]],
      passwordConfirm: ['', []],
    });
  }

  async onSubmit() {
    this.loading = true;
    const email = this.email.value;
    const password = this.password.value;
    let snackBarMessage: string;
    let errorMessage: string;

    if (this.isSignup) {
      await this.service
        .emailSignup(email, password)
        .then((_) => {
          this.analytics.logEvent('email_saved');
          snackBarMessage = 'Account saved.';
          this.router.navigateByUrl('/home');
        })
        .catch((error) => (errorMessage = error.message));
    } else if (this.isLogin) {
      await this.service
        .emailLogin(email, password)
        .then((_) => {
          this.analytics.logEvent('email_login');
          snackBarMessage = 'Successfully connected.';
          this.router.navigate(['/home']);
        })
        .catch((error) => (errorMessage = error.message));
    } else if (this.isPasswordReset) {
      await this.service
        .resetPassword(email)
        .then((_) => {
          this.analytics.logEvent('password_reset');
          snackBarMessage = 'Email sent.';
          this.router.navigate(['/home']);
        })
        .catch((error) => (errorMessage = error.message));
    }
    if (errorMessage) {
      console.log('here ', errorMessage);
      this.snackBar.open(errorMessage);
    } else {
      console.log('there ', snackBarMessage);
      this.snackBar.open(snackBarMessage);
    }

    this.loading = false;
  }

  changeType(type) {
    this.type = type;
  }

  get isLogin() {
    return this.type === 'login';
  }

  get isSignup() {
    return this.type === 'signup';
  }

  get isPasswordReset() {
    return this.type === 'reset';
  }

  get email() {
    return this.form.get('email');
  }

  get password() {
    return this.form.get('password');
  }

  get passwordConfirm() {
    return this.form.get('passwordConfirm');
  }

  get passwordDoesMatch() {
    const isMatching = this.password.value === this.passwordConfirm.value;

    if (!isMatching) {
      this.passwordConfirm.setErrors({
        notMatching: true,
      });
    }
    return isMatching;
  }
}
