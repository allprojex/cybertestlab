import { template as adminPasswordReset } from './admin-password-reset.tsx'

export interface TemplateEntry {
  // deno-lint-ignore no-explicit-any
  component: (props: any) => unknown
  // deno-lint-ignore no-explicit-any
  subject: string | ((props: any) => string)
  displayName?: string
  // deno-lint-ignore no-explicit-any
  previewData?: any
  // deno-lint-ignore no-explicit-any
  to?: (props: any) => string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'admin-password-reset': adminPasswordReset,
}
