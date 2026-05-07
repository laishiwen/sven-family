'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/hooks/useI18n';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

interface Company {
  name: string;
  domain: string;
}

const allCompanies: Company[] = [
  { name: 'Apple', domain: 'apple.com' },
  { name: 'Google', domain: 'google.com' },
  { name: 'Microsoft', domain: 'microsoft.com' },
  { name: 'Meta', domain: 'meta.com' },
  { name: 'Amazon', domain: 'amazon.com' },
  { name: 'Tesla', domain: 'tesla.com' },
  { name: 'Nvidia', domain: 'nvidia.com' },
  { name: 'OpenAI', domain: 'openai.com' },
  { name: 'Anthropic', domain: 'anthropic.com' },
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'Shopify', domain: 'shopify.com' },
  { name: 'Figma', domain: 'figma.com' },
  { name: 'Notion', domain: 'notion.so' },
  { name: 'Vercel', domain: 'vercel.com' },
  { name: 'Linear', domain: 'linear.app' },
  { name: 'GitHub', domain: 'github.com' },
  { name: 'GitLab', domain: 'gitlab.com' },
  { name: 'Spotify', domain: 'spotify.com' },
  { name: 'Netflix', domain: 'netflix.com' },
  { name: 'Airbnb', domain: 'airbnb.com' },
  { name: 'Uber', domain: 'uber.com' },
  { name: 'Canva', domain: 'canva.com' },
  { name: 'Dropbox', domain: 'dropbox.com' },
  { name: 'Slack', domain: 'slack.com' },
  { name: 'Zoom', domain: 'zoom.us' },
  { name: 'Databricks', domain: 'databricks.com' },
  { name: 'Supabase', domain: 'supabase.com' },
  { name: 'Cloudflare', domain: 'cloudflare.com' },
  { name: 'Twilio', domain: 'twilio.com' },
  { name: 'Snowflake', domain: 'snowflake.com' },
];

const RING_A = allCompanies.slice(0, 15);
const RING_B = allCompanies.slice(15);

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function LogoCircle({
  company,
  imgError,
  onError,
}: {
  company: Company;
  imgError: boolean;
  onError: () => void;
}) {
  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] shadow-sm transition-all duration-300 hover:border-amber-400/30 hover:shadow-md sm:h-14 sm:w-14">
      {imgError ? (
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {company.name.slice(0, 2)}
        </span>
      ) : (
        <img
          src={faviconUrl(company.domain)}
          alt={company.name}
          className="h-7 w-7 object-contain sm:h-8 sm:w-8"
          loading="lazy"
          onError={onError}
        />
      )}
    </div>
  );
}

export function Enterprises() {
  const { t } = useI18n();
  const { ref, inView } = useScrollAnimation(0.15);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [activeRing, setActiveRing] = useState<'a' | 'b'>('a');
  const [featuredIdx, setFeaturedIdx] = useState(0);

  const markError = (name: string) => {
    setErrors((prev) => ({ ...prev, [name]: true }));
  };

  const activeCompanies = activeRing === 'a' ? RING_A : RING_B;
  const featured = activeCompanies[featuredIdx % activeCompanies.length];

  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => {
      setFeaturedIdx((prev) => {
        const next = prev + 1;
        const list = activeRing === 'a' ? RING_A : RING_B;
        if (next >= list.length) {
          setActiveRing((r) => (r === 'a' ? 'b' : 'a'));
          return 0;
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(t);
  }, [inView, activeRing]);

  return (
    <section
      id="enterprises"
      className="relative overflow-hidden py-20 sm:py-28"
    >
      {/* CSS keyframes */}
      <style>{`
        @keyframes spin-cw {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spin-ccw {
          from { transform: rotate(360deg); }
          to   { transform: rotate(0deg); }
        }
        /* Snappy breathing — quick crossfade, long hold */
        @keyframes breathe-a {
          0%, 38%   { transform: scale(1); }
          44%, 88%  { transform: scale(0.4); }
          94%, 100% { transform: scale(1); }
        }
        @keyframes breathe-b {
          0%, 38%   { transform: scale(0.4); }
          44%, 88%  { transform: scale(1); }
          94%, 100% { transform: scale(0.4); }
        }
        /* Center logo pop — outer handles centering, inner only scale+opacity */
        @keyframes logo-pop-in {
          0%   { transform: scale(0.3); opacity: 0; }
          15%  { transform: scale(1.12); opacity: 1; }
          25%  { transform: scale(1); opacity: 1; }
          75%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.3); opacity: 0; }
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-10 text-center sm:mb-14"
        >
          <h2 className="text-3xl font-normal font-serif tracking-tight sm:text-4xl">
            {t.enterprises.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--text-secondary)] sm:text-base">
            {t.enterprises.subtitle}
          </p>
        </motion.div>

        {/* Rings area */}
        <div className="relative mx-auto aspect-square max-w-[560px]">
          {/* Center glow — behind everything */}
          <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-500/[0.04] to-amber-500/[0.04] blur-3xl sm:h-64 sm:w-64" />

          {/* Inner decorative circle — behind logos */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border-color)]/15 sm:h-[240px] sm:w-[240px]" />

          {/* Ring track line — behind logos */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[var(--border-color)]/10" />

          {/* Featured logo — outer div handles centering, inner animates scale */}
          <div
            key={featured.name}
            className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-amber-400/30 bg-[var(--card-bg)] shadow-lg shadow-amber-500/10 sm:h-20 sm:w-20"
              style={{ animation: 'logo-pop-in 3s ease-in-out infinite' }}
            >
              {errors[featured.name] ? (
                <span className="text-sm font-bold text-[var(--text-muted)]">
                  {featured.name.slice(0, 2)}
                </span>
              ) : (
                <img
                  src={faviconUrl(featured.domain)}
                  alt={featured.name}
                  className="h-9 w-9 object-contain sm:h-11 sm:w-11"
                  onError={() => markError(featured.name)}
                />
              )}
            </div>
          </div>

          {/* Ring A — breathes big→small, rotates CW */}
          <div
            className="absolute left-1/2 top-1/2 z-10"
            style={{
              width: 480,
              height: 480,
              marginLeft: -240,
              marginTop: -240,
              animation: 'breathe-a 20s ease-in-out infinite',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                animation: 'spin-cw 40s linear infinite',
              }}
            >
              {RING_A.map((company, i) => {
                const angle = (i / RING_A.length) * Math.PI * 2;
                const x = Math.cos(angle) * 240;
                const y = Math.sin(angle) * 240;
                return (
                  <div
                    key={company.name}
                    className="absolute"
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                      marginLeft: -28,
                      marginTop: -28,
                      animation: 'spin-ccw 40s linear infinite',
                    }}
                  >
                    <LogoCircle
                      company={company}
                      imgError={errors[company.name] ?? false}
                      onError={() => markError(company.name)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ring B — breathes small→big, rotates CCW */}
          <div
            className="absolute left-1/2 top-1/2 z-10"
            style={{
              width: 480,
              height: 480,
              marginLeft: -240,
              marginTop: -240,
              animation: 'breathe-b 20s ease-in-out infinite',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                animation: 'spin-ccw 50s linear infinite',
              }}
            >
              {RING_B.map((company, i) => {
                const angle = (i / RING_B.length) * Math.PI * 2;
                const x = Math.cos(angle) * 240;
                const y = Math.sin(angle) * 240;
                return (
                  <div
                    key={company.name}
                    className="absolute"
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                      marginLeft: -28,
                      marginTop: -28,
                      animation: 'spin-cw 50s linear infinite',
                    }}
                  >
                    <LogoCircle
                      company={company}
                      imgError={errors[company.name] ?? false}
                      onError={() => markError(company.name)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-[var(--bg-primary)] to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-r from-transparent to-[var(--bg-primary)] sm:w-24" />
        </div>
      </div>
    </section>
  );
}
