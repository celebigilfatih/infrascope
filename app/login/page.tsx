'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { Activity, Lock, Mail, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        // Session is now managed via httpOnly cookie (set by server).
        // localStorage is only for UI display, not for auth decisions.
        localStorage.setItem('user', JSON.stringify(data.user));
        // Pre-warm dashboard summary API (starts fetching while user navigates)
        fetch('/api/dashboard/summary').catch(() => {});
        router.push('/dashboard');
      } else {
        setError(data.error || 'Giriş başarısız');
      }
    } catch (err) {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f0f2f5]">
      {/* ==================== LEFT SIDE ==================== */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-10">
        {/* Top: Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">InfraScope</h1>
            <p className="text-sm text-gray-500">Altyapı Yönetimi</p>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-6">
          <h2 className="text-4xl font-bold text-gray-900 leading-tight">
            Altyapınızı. Güvenle.
          </h2>
          <h2 className="text-4xl font-bold text-emerald-500 leading-tight">
            Performansla.
          </h2>
          <p className="text-gray-500 text-sm mt-4 max-w-md">
            Modern altyapılar için izleme, sanallaştırma ve güvenlik yönetimi tek platformda birleştirin.
          </p>
        </div>

        {/* Center: Network Diagram Image */}
        <div className="flex-1 flex items-center justify-center my-4">
          <Image
            src="/images/login-hero.png"
            alt="InfraScope Network Topology"
            width={1200}
            height={700}
            className="object-contain w-full h-auto max-h-[55vh]"
            priority
          />
        </div>

        {/* Bottom: 4 Feature Tiles */}
        <div className="grid grid-cols-4 gap-6 mt-4">
          <div className="text-center">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-900">Tek Panelde Yönetim</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Altyapı, sanallaştırma ve güvenlik bileşenleri</p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-900">Gerçek Zamanlı İzleme</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Anlık metrikler ve akıllı alarm yönetimi</p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-900">Güvenli Erişim</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Rol tabanlı erişim ve 2 adımlı doğrulama</p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-900">Yüksek Performans</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Ölçeklenebilir mimari ile kesintisiz operasyon</p>
          </div>
        </div>
      </div>

      {/* ==================== RIGHT SIDE - Login Card ==================== */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 lg:p-10">
          {/* Logo - centered */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
              <Activity className="h-8 w-8 text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">InfraScope</h1>
            <p className="text-sm text-emerald-500">Altyapı Yönetimi</p>
          </div>

          {/* Title - centered */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              InfraScope&apos;a Hoş Geldiniz
            </h2>
            <p className="text-sm text-gray-500">
              Altyapı, sanallaştırma ve güvenlik yönetimini<br />tek panelden yönetin.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* E-posta */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">E-posta</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@domain.com"
                  className="pl-11 h-12 rounded-xl border-gray-200 bg-white focus:border-emerald-500 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Şifre */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi girin"
                  className="pl-11 pr-12 h-12 rounded-xl border-gray-200 bg-white focus:border-emerald-500 focus:ring-emerald-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Beni hatırla & Şifremi unuttum */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  className="border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 rounded"
                />
                <label htmlFor="remember" className="text-sm text-gray-700 cursor-pointer font-medium">
                  Beni hatırla
                </label>
              </div>
              <Link href="#" className="text-sm text-emerald-500 hover:text-emerald-600 font-medium">
                Şifremi unuttum
              </Link>
            </div>

            {/* Giriş Yap Button */}
            <Button
              type="submit"
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-base shadow-lg shadow-emerald-200 transition-all"
              disabled={loading}
            >
              {loading ? (
                'Giriş yapılıyor...'
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Giriş Yap
                  <ArrowRight className="h-5 w-5" />
                </span>
              )}
            </Button>

            {/* SSO Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 rounded-xl border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
            >
              <ShieldCheck className="h-4 w-4 mr-2 text-gray-500" />
              SSO ile Devam Et
            </Button>

            {/* Security Info */}
            <div className="flex items-center gap-3 pt-4">
              <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-gray-900 font-medium">
                  Güvenli erişim ve 2 adımlı doğrulama desteği
                </p>
                <p className="text-xs text-gray-500">
                  Tüm bağlantılarınız şifrelenerek korunur.
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
