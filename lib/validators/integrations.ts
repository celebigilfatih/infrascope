import { z } from '@/lib/i18n/validation';

export const fortianalyzerConfigSchema = z.object({
  host: z.string().min(1, "Sunucu adresi zorunludur."),
  username: z.string().optional(),
  password: z.string().optional(),
  apiKey: z.string().optional(),
  accessToken: z.string().optional(),
  authMode: z.enum(['session', 'api-key']).optional(),
  adom: z.string().trim().min(1, 'ADOM zorunludur.').max(128).optional(),
});

export const vmwareTestSchema = z.object({
  host: z.string().min(1, "Sunucu adresi zorunludur."),
  username: z.string().min(1, "Kullanıcı adı zorunludur."),
  password: z.string().min(1, "Parola zorunludur."),
});

export const vmwareSaveConfigSchema = z.object({
  host: z.string().min(1, "Sunucu adresi zorunludur."),
  username: z.string().min(1, "Kullanıcı adı zorunludur."),
  password: z.string().optional(),
  thumbprint: z.string().optional(),
  pollingInterval: z.number().int().min(1).max(1440).default(10),
  enabledModules: z.object({
    datacenters: z.boolean().default(true),
    clusters: z.boolean().default(true),
    hosts: z.boolean().default(true),
    vms: z.boolean().default(true),
    datastores: z.boolean().default(true),
  }).default({ datacenters: true, clusters: true, hosts: true, vms: true, datastores: true }),
});

export const topologyActionSchema = z.object({
  action: z.enum(['correlate'], { message: "İşlem geçersiz. Desteklenen işlem: ilişkilendirme." }),
});
