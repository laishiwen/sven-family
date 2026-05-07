'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/hooks/useI18n';
import { Sparkles, Mail, Twitter, MessageCircle } from 'lucide-react';

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <motion.a
      href={href}
      whileHover={{ x: 4 }}
      className="block text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
    >
      {children}
    </motion.a>
  );
}

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="relative border-t border-[var(--border-color)]">
      {/* Gradient line top */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold">Sven Studio</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
              Next-generation AI creation studio. Local-first, privacy-safe, built for creators and developers.
            </p>

            {/* Contact */}
            <div className="mt-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.footer.contact}
              </p>
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <Mail className="h-3.5 w-3.5" />
                {t.footer.contactEmail}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <Twitter className="h-3.5 w-3.5" />
                {t.footer.contactTwitter}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <MessageCircle className="h-3.5 w-3.5" />
                {t.footer.contactDiscord}
              </div>
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="mb-4 text-sm font-semibold">{t.footer.product}</p>
            <div className="space-y-2">
              <FooterLink href="#">{t.footer.productDownload}</FooterLink>
              <FooterLink href="#">{t.footer.productDocs}</FooterLink>
              <FooterLink href="#">{t.footer.productChangelog}</FooterLink>
              <FooterLink href="#">{t.footer.productPricing}</FooterLink>
            </div>
          </div>

          {/* Resources */}
          <div>
            <p className="mb-4 text-sm font-semibold">{t.footer.resources}</p>
            <div className="space-y-2">
              <FooterLink href="#">{t.footer.resourcesBlog}</FooterLink>
              <FooterLink href="#">{t.footer.resourcesCommunity}</FooterLink>
              <FooterLink href="#">{t.footer.resourcesPlugins}</FooterLink>
              <FooterLink href="#">{t.footer.resourcesTutorials}</FooterLink>
            </div>
          </div>

          {/* Company + Legal */}
          <div>
            <p className="mb-4 text-sm font-semibold">{t.footer.company}</p>
            <div className="space-y-2">
              <FooterLink href="#">{t.footer.companyAbout}</FooterLink>
              <FooterLink href="#">{t.footer.companyCareers}</FooterLink>
              <FooterLink href="#">{t.footer.companyContact}</FooterLink>
              <FooterLink href="#">{t.footer.companyPress}</FooterLink>
            </div>
            <p className="mb-3 mt-6 text-sm font-semibold">{t.footer.legal}</p>
            <div className="space-y-2">
              <FooterLink href="#">{t.footer.legalPrivacy}</FooterLink>
              <FooterLink href="#">{t.footer.legalTerms}</FooterLink>
              <FooterLink href="#">{t.footer.legalLicense}</FooterLink>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[var(--border-color)] pt-8 sm:flex-row">
          <p className="text-xs text-[var(--text-muted)]">{t.footer.copyright}</p>

          {/* ICP备案 — hidden */}
          <p className="hidden text-xs text-[var(--text-muted)] opacity-0">
            {t.footer.icp}
          </p>
        </div>
      </div>
    </footer>
  );
}
