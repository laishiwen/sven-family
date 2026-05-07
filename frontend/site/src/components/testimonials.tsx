'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/hooks/useI18n';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Star, Quote } from 'lucide-react';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-none text-[var(--text-muted)]'
          }`}
        />
      ))}
    </div>
  );
}

function TestimonialCard({
  name,
  role,
  avatar,
  rating,
  text,
  index,
}: {
  name: string;
  role: string;
  avatar: string;
  rating: number;
  text: string;
  index: number;
}) {
  const { ref, inView } = useScrollAnimation(0.1);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <motion.div
        whileHover={{ y: -3 }}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 transition-colors hover:border-amber-400/20 sm:p-6"
      >
        {/* Subtle hover gradient */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/[0.03] to-amber-500/[0.03] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="relative flex flex-1 flex-col">
          <Quote className="mb-3 h-5 w-5 text-amber-600/20" />
          <StarRating rating={rating} />

          <p className="mt-3 flex-1 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
            {text}
          </p>

          <div className="mt-4 flex items-center gap-3 border-t border-[var(--border-color)] pt-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-xs font-semibold text-white">
              {avatar}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate sm:text-sm">{name}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate sm:text-xs">{role}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Testimonials() {
  const { t } = useI18n();
  const { ref: titleRef, inView: titleInView } = useScrollAnimation(0.3);

  return (
    <section id="testimonials" className="relative py-20 sm:py-28">
      {/* Background */}
      <div className="absolute inset-0 bg-[var(--bg-secondary)]/50" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          ref={titleRef}
          initial={{ opacity: 0, y: 24 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-10 text-center sm:mb-14"
        >
          <span className="inline-block rounded-full bg-amber-500/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 sm:text-xs sm:px-4 sm:py-1.5">
            {t.testimonials.label}
          </span>
          <h2 className="mt-5 text-3xl font-normal font-serif tracking-tight sm:text-4xl">
            {t.testimonials.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--text-secondary)] sm:text-base">
            {t.testimonials.subtitle}
          </p>
        </motion.div>

        {/* 3-column grid */}
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {t.testimonials.items.map((item, i) => (
            <TestimonialCard key={i} {...item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
