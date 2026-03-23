import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

type LoginStep = 'idle' | 'loading' | 'qr' | 'authenticated' | 'ready' | 'error';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  step: LoginStep = 'idle';
  qrCode = '';
  phone = '';
  errorMsg = '';
  sessionId = '';
  private subs: Subscription[] = [];

  constructor(
    private auth: AuthService,
    private socket: SocketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const savedSession = localStorage.getItem('sessionId');
    if (savedSession) {
      this.auth.getSessionStatus().subscribe(status => {
        if (status.status === 'ready') {
          this.auth.setReady(status.phone!, status.sessionId!);
          this.router.navigate(['/dashboard']);
        }
      });
    }
  }

  startSession(): void {
    this.step = 'loading';
    this.errorMsg = '';

    this.auth.createSession().subscribe({
      next: (res) => {
        this.sessionId = res.sessionId;
        this.socket.connect(this.sessionId);
        this.subscribeSocketEvents();
      },
      error: (err) => {
        this.step = 'error';
        this.errorMsg = err.message || 'Failed to create session';
      }
    });
  }

  private subscribeSocketEvents(): void {
    this.subs.push(
      this.socket.on<any>('qr').subscribe(data => {
        this.step = 'qr';
        this.qrCode = data.qr;
      }),
      this.socket.on<any>('authenticated').subscribe(() => {
        this.step = 'authenticated';
      }),
      this.socket.on<any>('ready').subscribe(data => {
        this.step = 'ready';
        this.phone = data.phone;
        this.auth.setReady(data.phone, this.sessionId);
        setTimeout(() => this.router.navigate(['/dashboard']), 1500);
      }),
      this.socket.on<any>('auth_failure').subscribe(data => {
        this.step = 'error';
        this.errorMsg = 'Authentication failed. Please try again.';
      }),
      this.socket.on<any>('disconnected').subscribe(() => {
        if (this.step !== 'ready') {
          this.step = 'error';
          this.errorMsg = 'WhatsApp disconnected. Please try again.';
        }
      })
    );
  }

  retry(): void {
    this.step = 'idle';
    this.qrCode = '';
    this.errorMsg = '';
    this.socket.disconnect();
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
