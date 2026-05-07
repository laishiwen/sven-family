"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { useI18n } from "@/hooks/useI18n";
import { detectOS, getDownloadLabel } from "@/lib/utils";
import {
  Download,
  BookOpen,
  Apple,
  Monitor,
  Terminal,
  ArrowRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";

export function Hero() {
  const { t } = useI18n();
  const [os, setOs] = useState<ReturnType<typeof detectOS>>("unknown");
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  // Mouse parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 100, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 100, damping: 30 });

  useEffect(() => {
    setOs(detectOS());
    const onMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      mouseX.set((clientX - cx) / cx);
      mouseY.set((clientY - cy) / cy);
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [mouseX, mouseY]);

  const osIcon = os === "windows" ? Monitor : os === "linux" ? Terminal : Apple;
  const OsIconComponent = osIcon;

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[90vh] items-center overflow-hidden pt-16 sm:pt-20"
    >
      {/* Background effects */}
      <div className="absolute inset-0 grid-bg" />

      {/* Animated orbs */}
      <motion.div
        style={{
          x: useTransform(springX, [-1, 1], [-30, 30]),
          y: useTransform(springY, [-1, 1], [-30, 30]),
        }}
        className="pointer-events-none absolute -top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-r from-amber-500/15 to-amber-500/10 blur-[120px]"
      />
      <motion.div
        style={{
          x: useTransform(springX, [-1, 1], [20, -20]),
          y: useTransform(springY, [-1, 1], [20, -20]),
        }}
        className="pointer-events-none absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-gradient-to-r from-amber-400/10 to-amber-500/10 blur-[100px]"
      />

      <motion.div
        style={{ y, opacity }}
        className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 sm:text-sm">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {t.hero.badge}
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-4xl font-normal font-serif leading-tight tracking-tight sm:text-5xl md:text-6xl"
          >
            <span className="text-[var(--text-primary)]">{t.hero.title1} </span>
            <span className="text-gradient">{t.hero.title2}</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mx-auto mt-4 max-w-lg text-base text-[var(--text-secondary)] sm:text-lg"
          >
            {t.hero.subtitle}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            {/* Download button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-brand px-6 py-3 font-semibold text-white shadow-2xl shadow-amber-500/20 transition-shadow hover:shadow-amber-500/30 sm:px-8 sm:py-4 sm:rounded-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Download className="relative h-4 w-4 sm:h-5 sm:w-5" />
              <span className="relative text-sm sm:text-base">
                {t.hero.download}
              </span>
              <span className="relative ml-0.5 flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs">
                <OsIconComponent className="h-3 w-3" />
                <span className="hidden sm:inline">{getDownloadLabel(os)}</span>
              </span>
              <ArrowRight className="relative h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" />
            </motion.button>

            {/* Docs button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] px-6 py-3 font-medium transition-all hover:border-amber-400/30 hover:bg-amber-500/5 sm:px-8 sm:py-4 sm:rounded-2xl"
            >
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm sm:text-base">{t.hero.docs}</span>
            </motion.button>
          </motion.div>

          {/* Platform availability */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.65 }}
            className="mt-4 text-xs text-[var(--text-muted)] sm:text-sm"
          >
            {t.hero.available}
          </motion.p>

          {/* Product image */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.75 }}
            className="relative mx-auto mt-10 max-w-5xl sm:mt-14"
          >
            <div className="relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl sm:rounded-2xl">
              <div className="aspect-video sm:aspect-[2.2/1]">
                <div className="relative h-full w-full">
                  <Image
                    src="/images/studio.png"
                    alt="Sven Studio product screenshot"
                    fill
                    className=" object-center !h-auto"
                    priority
                  />
                </div>
              </div>
            </div>

            {/* Glow behind the card */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-500/10 to-amber-500/10 blur-2xl" />
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-1 text-[var(--text-muted)]"
        >
          <span className="text-[10px] sm:text-xs">Scroll</span>
          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </motion.div>
      </motion.div>
    </section>
  );
}
