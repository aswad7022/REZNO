"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, ImagePlus } from "lucide-react";

import { cn } from "@/lib/utils";

const icons = [Clock3, ImagePlus, CalendarDays] as const;

export function BusinessHeroSlider({
  slides,
  navigationLabel,
}: {
  slides: Array<{ title: string; description: string }>;
  navigationLabel: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[active];
  const Icon = icons[active] ?? Clock3;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-indigo-600 via-blue-600 to-violet-600 px-6 py-8 text-white shadow-sm sm:px-9">
      <div className="absolute -start-12 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex min-h-28 items-center gap-5">
        <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-white/15 sm:grid">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold sm:text-2xl">{slide.title}</h2>
          <p className="mt-2 text-sm leading-7 text-white/85">
            {slide.description}
          </p>
        </div>
      </div>
      <div className="relative mt-5 flex gap-2" aria-label={navigationLabel}>
        {slides.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`${index + 1}`}
            aria-current={index === active}
            className={cn(
              "h-1.5 rounded-full bg-white/40 transition-all",
              index === active ? "w-8 bg-white" : "w-3",
            )}
          />
        ))}
      </div>
    </section>
  );
}
