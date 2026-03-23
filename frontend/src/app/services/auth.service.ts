import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface SessionStatus {
  sessionId?: string;
  status: string;
  phone?: string;
  qr?: string;
  loggedIn?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = environment.apiUrl;
  private sessionId$ = new BehaviorSubject<string | null>(localStorage.getItem('sessionId'));
  private phone$ = new BehaviorSubject<string | null>(localStorage.getItem('phone'));

  constructor(private http: HttpClient) {}

  get sessionId(): string | null { return this.sessionId$.value; }
  get phone(): string | null { return this.phone$.value; }
  get sessionId$Obs() { return this.sessionId$.asObservable(); }

  createSession(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/create-session`, {}, { withCredentials: true }).pipe(
      tap(res => {
        if (res.sessionId) {
          this.sessionId$.next(res.sessionId);
          localStorage.setItem('sessionId', res.sessionId);
        }
      })
    );
  }

  getSessionStatus(): Observable<SessionStatus> {
    const sid = this.sessionId;
    const params = sid ? `?sessionId=${sid}` : '';
    return this.http.get<SessionStatus>(`${this.apiUrl}/auth/session-status${params}`, { withCredentials: true });
  }

  checkAuth(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/auth/check`, { withCredentials: true }).pipe(
      tap(res => {
        if (res.loggedIn) {
          this.sessionId$.next(res.sessionId);
          this.phone$.next(res.phone);
          localStorage.setItem('sessionId', res.sessionId);
          localStorage.setItem('phone', res.phone);
        }
      })
    );
  }

  setReady(phone: string, sessionId: string) {
    this.phone$.next(phone);
    this.sessionId$.next(sessionId);
    localStorage.setItem('phone', phone);
    localStorage.setItem('sessionId', sessionId);
  }

  logout(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.sessionId$.next(null);
        this.phone$.next(null);
        localStorage.removeItem('sessionId');
        localStorage.removeItem('phone');
      })
    );
  }

  isLoggedIn(): boolean {
    return !!this.phone && !!this.sessionId;
  }
}
