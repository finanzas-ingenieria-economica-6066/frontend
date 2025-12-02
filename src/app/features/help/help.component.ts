import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-help',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './help.component.html',
    styleUrl: './help.component.scss'
})
export class HelpComponent {
    faqs = [
        {
            question: '¿Cómo creo una nueva simulación?',
            answer: 'Para crear una nueva simulación, dirígete a la sección "Simulaciones" y haz clic en el botón "Nueva simulación". Sigue los pasos del asistente para ingresar los datos requeridos.',
            open: false
        },
        {
            question: '¿Qué es la TCEA?',
            answer: 'La Tasa de Costo Efectivo Anual (TCEA) es la tasa que incluye todos los costos de un crédito: intereses, comisiones y seguros. Es el mejor indicador para comparar el costo total de diferentes opciones de crédito.',
            open: false
        },
        {
            question: '¿Puedo exportar los resultados?',
            answer: 'Sí, una vez finalizada la simulación, puedes ver la tabla de amortización y exportarla a Excel o CSV utilizando el botón "Exportar" ubicado en la parte superior de la tabla.',
            open: false
        },
        {
            question: '¿Cómo se calculan los seguros?',
            answer: 'El seguro de desgravamen se calcula sobre el saldo deudor del crédito. El seguro de inmueble se calcula sobre el valor del inmueble.',
            open: false
        }
    ];

    toggleFaq(index: number) {
        this.faqs[index].open = !this.faqs[index].open;
    }
}
