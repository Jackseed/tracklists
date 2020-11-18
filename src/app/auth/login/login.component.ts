import { Component, OnInit } from "@angular/core";
import { FormGroup, FormBuilder, Validators } from "@angular/forms";
import { AuthService, AuthQuery, User } from "../+state";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AngularFireAnalytics } from "@angular/fire/analytics";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  form: FormGroup;
  user: User;
  serverMessage: string;
  type: "login" | "signup" | "reset" = "signup";
  loading = false;

  constructor(
    private query: AuthQuery,
    public service: AuthService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private analytics: AngularFireAnalytics,
  ) {}

  ngOnInit(): void {
    this.user = this.query.getActive();
    this.form = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.minLength(6), Validators.required]],
      passwordConfirm: ["", []]
    });
  }

  async onSubmit() {
    this.loading = true;
    const email = this.email.value;
    const password = this.password.value;
    let snackBarMessage: string;

    if (this.isSignup) {
      this.serverMessage = await this.service.emailSignup(email, password);
      this.analytics.logEvent("email_saved");
      snackBarMessage = "Account saved";
    } else if (this.isLogin) {
      this.serverMessage = await this.service.emailLogin(email, password);
      this.analytics.logEvent("email_login");
      snackBarMessage = "Successfully connected";
    } else if (this.isPasswordReset) {
      this.serverMessage = await this.service.resetPassword(email);
      this.analytics.logEvent("password_reset");
      snackBarMessage = "Email sent";
    }

    if (!this.serverMessage) {
      this.snackBar.open(snackBarMessage);
      this.form.reset();
    }
    this.loading = false;
  }

  changeType(type) {
    this.type = type;
  }

  get isLogin() {
    return this.type === "login";
  }

  get isSignup() {
    return this.type === "signup";
  }

  get isPasswordReset() {
    return this.type === "reset";
  }

  get email() {
    return this.form.get("email");
  }

  get password() {
    return this.form.get("password");
  }

  get passwordConfirm() {
    return this.form.get("passwordConfirm");
  }

  get passwordDoesMatch() {
    const isMatching = this.password.value === this.passwordConfirm.value;

    if (!isMatching) {
      this.passwordConfirm.setErrors({
        notMatching: true
      });
    }
    return isMatching;
  }

}
