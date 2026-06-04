import { z } from 'zod';

export const fortianalyzerConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().optional(),
});

export const vmwareTestSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const vmwareSaveConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  username: z.string().min(1, 'Username is required'),
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
  action: z.enum(['correlate'], { message: 'Invalid action. Supported: correlate' }),
});
