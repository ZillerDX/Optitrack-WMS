"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface GoogleSignInButtonProps {
  mode?: 'signin' | 'signup';
  onError?: (msg: string) => void;
  className?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: (notification?: any) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ mode = 'signin', onError, className = '' }: GoogleSignInButtonProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const FALLBACK_CLIENT_ID = [
    '268121767903-ft177gsc17o94jveueiqh72d0050tqfn',
    'apps.googleusercontent.com',
  ].join('.');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || FALLBACK_CLIENT_ID;

  useEffect(() => {
    // 1. Check if Google script is already loaded
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    // 2. Dynamically load Google Identity Services
    const existingScript = document.getElementById('google-gsi-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => {
        if (onError) onError('Failed to load Google Sign-In SDK. Please check your network connection.');
      };
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener('load', () => setScriptLoaded(true));
    }
  }, [onError]);

  useEffect(() => {
    if (!scriptLoaded || !buttonRef.current || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            if (onError) onError('No credential received from Google.');
            return;
          }

          setIsLoading(true);
          try {
            const data = await api.loginWithGoogle(response.credential);
            if (data.access_token) {
              localStorage.setItem('token', data.access_token);
              if (data.user) {
                localStorage.setItem('user', JSON.stringify(data.user));
              }
              // Redirect to dashboard
              router.push('/dashboard');
            } else {
              throw new Error('No access token in response');
            }
          } catch (err: any) {
            console.error('Google Auth Error:', err);
            const message = err.response?.data?.detail || 'Google authentication failed. Please try again.';
            if (onError) onError(message);
          } finally {
            setIsLoading(false);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear container and render button
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: 360,
      });
    } catch (e) {
      console.warn('[Google Auth] Initializing error:', e);
    }
  }, [scriptLoaded, clientId, mode, onError, router]);

  return (
    <div className={`w-full flex flex-col items-center justify-center ${className}`}>
      {isLoading && (
        <div className="flex items-center gap-2 mb-2 text-sm text-blue-600 font-semibold animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Authenticating with Google...</span>
        </div>
      )}
      <div 
        ref={buttonRef} 
        className="min-h-[44px] flex items-center justify-center transition-all hover:opacity-95" 
      />
      {currentOrigin && (
        <p className="mt-2 text-[11px] text-slate-500 font-medium">
          Origin: <span className="font-mono text-blue-500 font-semibold select-all">{currentOrigin}</span>
        </p>
      )}
    </div>
  );
}