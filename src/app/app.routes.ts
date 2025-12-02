import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { HomeComponent } from './features/dashboard/home/home.component';
import { WizardComponent } from './features/simulation/wizard/wizard.component';
import { ResultsComponent } from './features/simulation/results/results.component';
import { SimulationListComponent } from './features/simulation/simulation-list/simulation-list.component';
import { SimulationDetailsComponent } from './features/simulation/simulation-details/simulation-details.component';
import { ExportComponent } from './features/export/export.component';
import { HelpComponent } from './features/help/help.component';
import { GraficosComponent } from './features/graficos/graficos.component';
import { MainLayoutComponent } from './shared/layouts/main-layout/main-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { publicGuard } from './core/guards/public.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [publicGuard]
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: HomeComponent },
      { path: 'simulations', component: SimulationListComponent },
      { path: 'simulation/new', component: WizardComponent },
      { path: 'simulation/results', component: ResultsComponent },
      { path: 'simulation/:id', component: SimulationDetailsComponent },
      { path: 'export', component: ExportComponent },
      { path: 'graficos', component: GraficosComponent },
      {
        path: 'comparator',
        loadComponent: () => import('./features/comparator/comparator.component').then(m => m.ComparatorComponent)
      },
      { path: 'help', component: HelpComponent },
    ]
  },
  { path: '**', redirectTo: 'login' }
];
