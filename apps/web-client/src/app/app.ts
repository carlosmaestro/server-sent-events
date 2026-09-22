import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SseService } from './services/sse.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly sseService = inject(SseService);

  clientNameInput = signal('Cliente ' + Math.floor(100 + Math.random() * 900));

  handleConnect(): void {
    const name = this.clientNameInput().trim();
    if (name) {
      this.sseService.connect(name);
    }
  }

  handleDisconnect(): void {
    this.sseService.disconnect();
  }

  handleClear(): void {
    this.sseService.clearMessages();
  }
}
