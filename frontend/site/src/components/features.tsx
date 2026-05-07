'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '@/hooks/useI18n';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import {
  Zap,
  Palette,
  Code,
  Globe,
  Layers,
  Shield,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Zap,
  Palette,
  Code,
  Globe,
  Layers,
  Shield,
};

function FeatureCard({
  icon,
  title,
  desc,
  index,
}: {
  icon: string;
  title: string;
  desc: string;
  index: number;
}) {
  const { ref, inView } = useScrollAnimation(0.15);
  const Icon = iconMap[icon] ?? Zap;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        className="group relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 transition-colors hover:border-amber-400/20"
      >
        {/* Hover glow */}
        <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-amber-500/0 via-amber-500/0 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative">
          <motion.div
            whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/15"
          >
            <Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </motion.div>

          <h3 className="mb-3 text-lg font-semibold">{title}</h3>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{desc}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Features() {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLDivElement>(null);
  const { ref: titleRef, inView: titleInView } = useScrollAnimation(0.3);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <motion.div
          ref={titleRef}
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-12 text-center"
        >
          <span className="inline-block rounded-full bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            {t.features.label}
          </span>
          <h2 className="mt-6 text-4xl font-normal font-serif tracking-tight sm:text-5xl">
            {t.features.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)]">
            {t.features.subtitle}
          </p>
        </motion.div>

        {/* Feature grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((item, i) => (
            <FeatureCard key={item.title} {...item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
