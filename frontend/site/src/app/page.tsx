import { Header } from '@/components/header';
import { Hero } from '@/components/hero';
import { Features } from '@/components/features';
import { Testimonials } from '@/components/testimonials';
import { Enterprises } from '@/components/enterprises';
import { Footer } from '@/components/footer';
import { BackToTop } from '@/components/back-to-top';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Header />
      <Hero />
      <Features />
      <Testimonials />
      <Enterprises />
      <Footer />
      <BackToTop />
    </main>
  );
}
