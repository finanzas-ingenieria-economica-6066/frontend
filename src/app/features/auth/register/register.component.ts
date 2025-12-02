import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, CommonModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = false;
  showPassword = false;
  showConfirmPassword = false;
  errorMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[^\s].*$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      terms: [false, [Validators.requiredTrue]]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.errorMessage = null;
      let { name, email, password } = this.registerForm.value;

      email = email.trim();

      const formattedName = name.trim().split(' ')
        .filter((word: string) => word.length > 0)
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      const registerData = {
        fullName: formattedName,
        email,
        password
      };

      this.authService.register(registerData).subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.isLoading = false;
          console.error('Register failed', err);
          if (err.status === 400 || err.status === 409) {
            if (err.error && (typeof err.error === 'string' && err.error.includes('email') || err.error.message?.includes('email'))) {
              this.errorMessage = 'El correo electrónico ya está registrado. Intenta con otro.';
            } else {
              this.errorMessage = err.error?.message || 'Error en el registro. Verifica tus datos.';
            }
          } else {
            this.errorMessage = 'Error al registrarse. Por favor, inténtalo de nuevo.';
          }
        }
      });
    } else {
      this.registerForm.markAllAsTouched();
      if (this.registerForm.get('terms')?.invalid) {
        this.errorMessage = 'Debes aceptar los términos y condiciones para continuar.';
      } else {
        this.errorMessage = 'Por favor, completa todos los campos requeridos correctamente.';
      }
    }
  }
}
