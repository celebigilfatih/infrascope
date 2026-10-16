import { z } from 'zod';

// Every validator using this entry point shares Turkish default issue messages.
z.config(z.locales.tr());
export * from 'zod';
