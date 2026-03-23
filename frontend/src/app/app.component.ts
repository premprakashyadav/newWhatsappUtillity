import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `<router-outlet></router-outlet>`,
  styles: [`
    :host { display: block; min-height: 100vh; }
  `]
})
export class AppComponent {
  title = 'WhatsApp Utility';
}
