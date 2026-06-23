/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  adminName?: string
  resetUrl?: string
  siteName?: string
  expiresInMinutes?: number
}

const Email = ({
  adminName = 'Admin',
  resetUrl = 'https://example.com/reset-password',
  siteName = 'CYBER TEST 360',
  expiresInMinutes = 60,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {siteName} admin password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>{siteName}</Heading>
          <Text style={subtle}>Admin Password Reset</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>Hi {adminName},</Heading>
          <Text style={text}>
            We received a request to reset the password for your administrator
            account. Click the button below to choose a new password.
          </Text>

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={resetUrl} style={button}>
              Reset Password
            </Button>
          </Section>

          <Text style={textSmall}>
            Or paste this link into your browser:
            <br />
            <Link href={resetUrl} style={link}>
              {resetUrl}
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={textSmall}>
            This link expires in {expiresInMinutes} minutes. If you didn't
            request a password reset, you can safely ignore this email — your
            password will not change.
          </Text>
        </Section>

        <Text style={footer}>
          {siteName} · Sent because a password reset was requested for your
          admin account.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Reset your admin password',
  displayName: 'Admin password reset',
  previewData: {
    adminName: 'Admin',
    resetUrl: 'https://example.com/reset-password#access_token=demo',
    siteName: 'CYBER TEST 360',
    expiresInMinutes: 60,
  },
} satisfies TemplateEntry

const PRIMARY = 'hsl(145, 63%, 28%)'
const FOREGROUND = 'hsl(150, 30%, 10%)'
const MUTED = 'hsl(150, 10%, 45%)'
const BORDER = 'hsl(140, 15%, 85%)'
const RADIUS = '10px'

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  color: FOREGROUND,
  margin: 0,
  padding: 0,
}

const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 20px',
}

const header: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '20px',
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS,
  padding: '28px 28px 24px',
}

const h1: React.CSSProperties = {
  color: PRIMARY,
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  margin: 0,
}

const h2: React.CSSProperties = {
  color: FOREGROUND,
  fontSize: '18px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const subtle: React.CSSProperties = {
  color: MUTED,
  fontSize: '13px',
  margin: '6px 0 0',
}

const text: React.CSSProperties = {
  color: FOREGROUND,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const textSmall: React.CSSProperties = {
  color: MUTED,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 12px',
  wordBreak: 'break-all',
}

const button: React.CSSProperties = {
  backgroundColor: PRIMARY,
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: RADIUS,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '15px',
  display: 'inline-block',
}

const link: React.CSSProperties = {
  color: PRIMARY,
  textDecoration: 'underline',
}

const hr: React.CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${BORDER}`,
  margin: '20px 0',
}

const footer: React.CSSProperties = {
  color: MUTED,
  fontSize: '12px',
  textAlign: 'center',
  marginTop: '20px',
}
