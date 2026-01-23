'use client';

import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Service, ApiResponse } from '../../types';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, Plus, Trash2, Settings2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ServicesPage() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: ApiResponse<Service[]> = await apiGet('/api/services');
      if (response.success) {
        setServices(response.data || []);
      } else {
        setError('Servisler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Servisler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setServiceToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      const response: any = await apiDelete(`/api/services/${serviceToDelete.id}`);
      if (response.success) {
        toast({
          title: "Başarılı",
          description: `${serviceToDelete.name} servisi silindi.`,
        });
        loadServices();
      } else {
        toast({
          title: "Hata",
          description: response.error || 'Servis silinemedi',
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: 'Servis silinirken hata oluştu',
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
    }
  };

  const filteredServices = services.filter(service => {
    return service.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           service.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" => {
    switch (status) {
      case 'RUNNING': return 'success';
      case 'STOPPED': return 'destructive';
      case 'DEGRADED': return 'warning';
      default: return 'secondary';
    }
  };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Servisler ve Uygulamalar</h1>
            <p className="mt-2 text-muted-foreground">Ağ servislerini ve yazılım yığınlarını izleyin ve yönetin</p>
          </div>
          <Button size="lg" className="font-bold shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-5 w-5" />
            Yeni Servis Kaydet
          </Button>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="p-4 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Servisleri isme göre ara..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadServices} title="Yenile">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCcw className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-6 flex items-center justify-between">
              <p className="text-destructive font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={loadServices}>Tekrar Dene</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Henüz kayıtlı servis bulunamadı.
                </CardContent>
              </Card>
            ) : (
              filteredServices.map((service) => (
                <Card key={service.id} className="hover:border-primary/50 transition-colors group overflow-hidden shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                          {service.displayName || service.name}
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase tracking-widest font-bold">
                          {service.type.replace(/_/g, ' ')}
                        </CardDescription>
                      </div>
                      <Badge variant={getStatusVariant(service.status)}>
                        {service.status === 'RUNNING' ? 'ÇALIŞIYOR' : 
                         service.status === 'STOPPED' ? 'DURDURULDU' : 
                         service.status === 'DEGRADED' ? 'SORUNLU' : service.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-4">
                    <div className="space-y-3">
                      <div className="flex items-center text-sm">
                        <span className="w-20 text-muted-foreground font-semibold text-xs uppercase tracking-wider">Port/Prot:</span>
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {service.port} / {service.protocol}
                        </Badge>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="w-20 text-muted-foreground font-semibold text-xs uppercase tracking-wider">Kritiklik:</span>
                        <span className={cn(
                          "text-xs font-black uppercase tracking-tight",
                          service.criticality === 'CRITICAL' ? 'text-destructive' : 
                          service.criticality === 'HIGH' ? 'text-orange-500' : 'text-primary'
                        )}>
                          {service.criticality}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <div className="flex justify-between items-center p-4 bg-muted/30 border-t border-border/50">
                    <Button variant="ghost" size="sm" className="h-8 text-primary hover:text-primary hover:bg-primary/10">
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Detaylar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(service.id, service.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Sil
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Servisi Sil"
          description={`${serviceToDelete?.name} servisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`}
          onConfirm={confirmDelete}
          variant="destructive"
          confirmText="Sil"
        />
      </main>
    </>
  );
}
