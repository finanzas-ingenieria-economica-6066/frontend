import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SimulationService, SimulationData, SimulationResult } from '../../../core/services/simulation.service';
import { ResultsComponent } from '../results/results.component';
import { AuthService } from '../../../core/services/auth.service';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ResultsComponent],
  templateUrl: './wizard.component.html',
  styleUrl: './wizard.component.scss'
})
export class WizardComponent implements OnInit {
  currentStep = 1;
  simulationForm: FormGroup;
  simulationResult: SimulationResult | null = null;
  simulationData: SimulationData | null = null;
  isLoading = false;
  errorMessage: string | null = null;
  userId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private simulationService: SimulationService,
    private authService: AuthService,
    private router: Router
  ) {
    this.simulationForm = this.fb.group({
      // Step 1: Datos
      name: ['', [Validators.required, Validators.maxLength(50)]],
      currency: ['PEN', Validators.required],
      loanAmount: [0, [Validators.required, Validators.min(1000), Validators.max(5000000)]], // Min 1k, Max 5M
      bbpAmount: [0, [Validators.required, Validators.min(0), Validators.max(100000)]], // Max 100k for BBP
      initialFeePercentage: [10, [Validators.required, Validators.min(0), Validators.max(90)]], // Default 10%
      initialFeeAmount: [0, [Validators.required, Validators.min(0), Validators.max(5000000)]], // Max same as loan
      disbursementDate: [new Date().toISOString().split('T')[0], Validators.required],
      exchangeRate: [3.75, [Validators.required, Validators.min(0.1), Validators.max(10)]],

      // Step 2: Tasas
      interestType: ['EFFECTIVE', Validators.required],
      annualRate: [0, [Validators.required, Validators.min(0.1), Validators.max(100)]],
      paymentFrequency: ['MONTHLY', Validators.required],
      totalMonths: [120, [Validators.required, Validators.min(6), Validators.max(360)]],
      capitalizationPeriod: ['DAILY', Validators.required],

      // Step 3: Gracia y Cargos
      gracePeriodType: ['NONE', Validators.required],
      gracePeriodMonths: [0, [Validators.required, Validators.min(0), Validators.max(24)]],
      insurancePercentage: [0, [Validators.required, Validators.min(0), Validators.max(5)]],
      fixedInsurance: [0, [Validators.required, Validators.min(0), Validators.max(1000)]],
      initialCommission: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
      periodicCommission: [0, [Validators.required, Validators.min(0), Validators.max(1000)]],
      finalCommission: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
      discountRate: [0, [Validators.required, Validators.min(0), Validators.max(100)]]
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.id) {
        this.userId = user.id;
      }
    });

    // Iniciamos los cálculos automáticos
    this.setupAutoCalculations();
  }

  // --- LÓGICA DE CÁLCULO AUTOMÁTICO (NUEVO) ---
  setupAutoCalculations() {
    const loanControl = this.simulationForm.get('loanAmount');
    const percentControl = this.simulationForm.get('initialFeePercentage');
    const amountControl = this.simulationForm.get('initialFeeAmount');

    if (!loanControl || !percentControl || !amountControl) return;

    // 1. Si cambia el MONTO DEL PRÉSTAMO, recalculamos el monto inicial manteniendo el porcentaje
    loanControl.valueChanges.pipe(distinctUntilChanged(), debounceTime(300)).subscribe(loan => {
      const percent = percentControl.value;
      if (loan && percent) {
        const newAmount = (loan * percent) / 100;
        // emitEvent: false evita un bucle infinito
        amountControl.setValue(Number(newAmount.toFixed(2)), { emitEvent: false });
      }
    });

    // 2. Si cambia el PORCENTAJE DE INICIAL (El usuario pone 20%) -> Calculamos dinero
    percentControl.valueChanges.pipe(distinctUntilChanged(), debounceTime(300)).subscribe(percent => {
      const loan = loanControl.value;
      if (loan && percent !== null) {
        const newAmount = (loan * percent) / 100;
        amountControl.setValue(Number(newAmount.toFixed(2)), { emitEvent: false });
      }
    });

    // 3. Si cambia el MONTO DE INICIAL (El usuario pone 5000 soles) -> Calculamos porcentaje
    amountControl.valueChanges.pipe(distinctUntilChanged(), debounceTime(300)).subscribe(amount => {
      const loan = loanControl.value;
      if (loan && amount !== null) {
        const newPercent = (amount / loan) * 100;
        // Redondeamos a 2 decimales para que no salga 33.333333%
        percentControl.setValue(Number(newPercent.toFixed(2)), { emitEvent: false });
      }
    });
  }

  nextStep() {
    if (this.currentStep < 4) {
      if (this.validateStep(this.currentStep)) {
        this.currentStep++;
        if (this.currentStep === 4) {
          this.calculate();
        }
      } else {
        this.markStepAsTouched(this.currentStep);
      }
    } else {
      // Finalizar / Guardar
      this.saveSimulation();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  validateStep(step: number): boolean {
    const controls = this.simulationForm.controls;
    switch (step) {
      case 1:
        return controls['name'].valid && controls['currency'].valid &&
          controls['loanAmount'].valid && controls['bbpAmount'].valid &&
          controls['initialFeePercentage'].valid && controls['initialFeeAmount'].valid &&
          controls['disbursementDate'].valid && controls['exchangeRate'].valid;
      case 2:
        return controls['interestType'].valid && controls['annualRate'].valid &&
          controls['paymentFrequency'].valid && controls['totalMonths'].valid &&
          controls['capitalizationPeriod'].valid;
      case 3:
        return controls['gracePeriodType'].valid && controls['gracePeriodMonths'].valid &&
          controls['insurancePercentage'].valid && controls['fixedInsurance'].valid &&
          controls['initialCommission'].valid && controls['periodicCommission'].valid &&
          controls['finalCommission'].valid && controls['discountRate'].valid;
      default:
        return true;
    }
  }

  markStepAsTouched(step: number) {
    const controls = this.simulationForm.controls;
    const fieldsStep1 = ['name', 'currency', 'loanAmount', 'bbpAmount', 'initialFeePercentage', 'initialFeeAmount', 'disbursementDate', 'exchangeRate'];
    const fieldsStep2 = ['interestType', 'annualRate', 'paymentFrequency', 'totalMonths', 'capitalizationPeriod'];
    const fieldsStep3 = ['gracePeriodType', 'gracePeriodMonths', 'insurancePercentage', 'fixedInsurance', 'initialCommission', 'periodicCommission', 'finalCommission', 'discountRate'];

    let fieldsToMark: string[] = [];
    if (step === 1) fieldsToMark = fieldsStep1;
    if (step === 2) fieldsToMark = fieldsStep2;
    if (step === 3) fieldsToMark = fieldsStep3;

    fieldsToMark.forEach(field => controls[field].markAsTouched());
  }

  calculate() {
    if (this.simulationForm.invalid) {
      const controls = this.simulationForm.controls;
      for (const name in controls) {
        if (controls[name].invalid) {
          console.log(`Campo inválido: ${name}`);
        }
      }
    }

    if (this.simulationForm.valid && this.userId) {
      this.isLoading = true;
      this.errorMessage = null;

      const formData = this.simulationForm.value;

      const simulationData: SimulationData = {
        ...formData,
        userId: this.userId

      };

      this.simulationData = simulationData;

      this.simulationService.simulateCredit(simulationData).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.simulationResult = response;
        },
        error: (err) => {
          this.isLoading = false;
          console.error('Simulation failed', err);
          this.errorMessage = 'Ocurrió un error al procesar la simulación. Por favor verifica que los datos ingresados sean correctos.';
        }
      });
    } else {
      console.warn('Cannot calculate: Form invalid or User ID missing');
      this.errorMessage = 'Formulario inválido o usuario no identificado.';
    }
  }

  saveSimulation() {
    if (this.simulationResult) {
      this.router.navigate(['/simulations']);
    } else {
      if (this.simulationData) {
        this.simulationService.saveSimulation(this.simulationData).subscribe({
          next: () => {
            this.router.navigate(['/simulations']);
          },
          error: (err) => {
            console.error('Error saving simulation', err);
            alert('Error al guardar la simulación');
          }
        });
      }
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.simulationForm.get(fieldName);
    return control ? (control.invalid && (control.dirty || control.touched)) : false;
  }
}