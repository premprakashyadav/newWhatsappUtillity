import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private events = new Map<string, Subject<any>>();

  connect(sessionId: string): void {
    if (this.socket?.connected) return;

    this.socket = io(environment.wsUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.socket?.emit('init-session', sessionId);
    });

    const eventNames = ['qr', 'ready', 'authenticated', 'auth_failure', 'disconnected', 'bulk-start', 'bulk-progress', 'bulk-complete', 'bulk-error'];
    eventNames.forEach(event => {
      if (!this.events.has(event)) this.events.set(event, new Subject());
      this.socket?.on(event, (data: any) => this.events.get(event)?.next(data));
    });
  }

  on<T>(event: string): Observable<T> {
    if (!this.events.has(event)) this.events.set(event, new Subject());
    return this.events.get(event)!.asObservable();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.events.forEach(s => s.complete());
    this.events.clear();
  }
}
