'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
        localStorage.setItem('user', JSON.stringify(data.user));
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
      {/* ==================== LEFT SIDE - Isometric Network Diagram ==================== */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center">
        {/* Isometric Network Visualization */}
        <div className="relative w-full h-full max-w-[700px] max-h-[700px]">
          
          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 700 700" fill="none" preserveAspectRatio="xMidYMid meet">
            {/* Main lines from center (350,370) */}
            <path d="M350 370 L350 130" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L560 280" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L620 450" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L130 500" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L300 560" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L480 560" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L150 280" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L280 200" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M350 370 L560 140" stroke="#e5e7eb" strokeWidth="2.5" />
            {/* Branching lines */}
            <path d="M560 280 L620 200" stroke="#e5e7eb" strokeWidth="2" />
            <path d="M620 450 L660 530" stroke="#e5e7eb" strokeWidth="2" />
            <path d="M150 280 L100 220" stroke="#e5e7eb" strokeWidth="2" />
            
            {/* Green dots on lines */}
            <circle cx="350" cy="250" r="5" fill="#10b981" />
            <circle cx="455" cy="325" r="5" fill="#10b981" />
            <circle cx="485" cy="415" r="5" fill="#10b981" />
            <circle cx="240" cy="435" r="5" fill="#10b981" />
            <circle cx="325" cy="465" r="5" fill="#10b981" />
            <circle cx="415" cy="465" r="5" fill="#10b981" />
            <circle cx="250" cy="325" r="5" fill="#10b981" />
            <circle cx="315" cy="285" r="5" fill="#10b981" />
            <circle cx="455" cy="255" r="5" fill="#10b981" />
            <circle cx="590" cy="240" r="5" fill="#10b981" />
            <circle cx="530" cy="160" r="5" fill="#10b981" />
            <circle cx="640" cy="490" r="5" fill="#10b981" />
          </svg>

          {/* Central Node - 3D Isometric Platform */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[55%] z-20">
            {/* Platform base */}
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-b from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-300/50 rotate-0">
                <Activity className="h-12 w-12 text-white" />
              </div>
              {/* Glow effect */}
              <div className="absolute -inset-4 bg-emerald-400/20 rounded-full blur-xl -z-10" />
              {/* Base platform */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-gradient-to-b from-gray-100 to-gray-200 rounded-lg -z-10 shadow-lg" />
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-36 h-4 bg-gradient-to-b from-gray-200 to-gray-300 rounded-lg -z-20" />
            </div>
          </div>

          {/* Card: Sistem Sağlığı - top center */}
          <div className="absolute top-[8%] left-1/2 -translate-x-1/2 bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-48 z-10">
            <p className="text-sm text-gray-600 flex items-center gap-2 font-medium">
              <span className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </span>
              Sistem Sağlığı
            </p>
            <p className="text-3xl font-bold text-emerald-500 mt-2">93<span className="text-base text-gray-400 font-normal">/100</span></p>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '93%' }} />
            </div>
            <p className="text-xs text-emerald-500 mt-1.5 font-medium">Çok İyi</p>
          </div>

          {/* Card: Alarmlar - right middle */}
          <div className="absolute top-[35%] right-[5%] bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-44 z-10">
            <p className="text-sm text-gray-600 flex items-center gap-2 font-medium">
              <span className="text-red-400">⚠</span>
              Alarmlar
            </p>
            <p className="text-3xl font-bold text-emerald-500 mt-2">41</p>
            <p className="text-xs text-gray-500 mt-1">engellenen IP adresi</p>
          </div>

          {/* Card: VM'ler - bottom left */}
          <div className="absolute bottom-[18%] left-[3%] bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-44 z-10">
            <p className="text-sm text-gray-600 flex items-center gap-2 font-medium">
              <span className="w-4 h-4 bg-blue-50 rounded flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              VM&apos;ler
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">247</p>
            <p className="text-xs mt-1.5">
              <span className="text-emerald-500 font-medium">74 aktif</span>
              <span className="text-gray-400 mx-1">·</span>
              <span className="text-red-400 font-medium">173 kapalı</span>
            </p>
          </div>

          {/* Card: Storage - bottom center */}
          <div className="absolute bottom-[10%] left-[32%] bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-44 z-10">
            <p className="text-sm text-gray-600 flex items-center gap-2 font-medium">
              <span className="w-4 h-4 bg-emerald-50 rounded flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </span>
              Storage
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">55%</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '55%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Kullanım Oranı</p>
          </div>

          {/* Card: SSL-VPN - bottom right */}
          <div className="absolute bottom-[15%] right-[18%] bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-36 z-10">
            <p className="text-sm text-gray-600 flex items-center gap-2 font-medium">
              <span className="w-4 h-4 bg-emerald-50 rounded flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
              </span>
              SSL-VPN
            </p>
            <p className="text-3xl font-bold text-emerald-500 mt-2">5</p>
            <p className="text-xs text-gray-500 mt-1">aktif oturum</p>
          </div>

          {/* 3D Icon: Cloud - top left */}
          <div className="absolute top-[22%] left-[22%] z-10">
            <div className="w-14 h-14 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
          </div>

          {/* 3D Icon: Shield - top right */}
          <div className="absolute top-[12%] right-[15%] z-10">
            <div className="w-14 h-14 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>

          {/* 3D Icon: Network nodes - left */}
          <div className="absolute top-[55%] left-[8%] z-10">
            <div className="w-14 h-14 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>

          {/* 3D Icon: Database/Coins - far right */}
          <div className="absolute top-[40%] right-[0%] z-10">
            <div className="w-12 h-12 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
          </div>

          {/* 3D Icon: Server - bottom far right */}
          <div className="absolute bottom-[25%] right-[2%] z-10">
            <div className="w-14 h-14 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
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
