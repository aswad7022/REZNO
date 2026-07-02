"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PublicProfileActions({
  businessName,
  labels,
  path,
}: {
  businessName: string;
  path?: string;
  labels: {
    share: string;
    copy: string;
    copied: string;
    qr: string;
    qrDescription: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const pageUrl = () =>
    path ? `${window.location.origin}${path}` : window.location.href;

  async function copyLink() {
    await navigator.clipboard.writeText(pageUrl());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: businessName, url: pageUrl() });
      return;
    }
    await copyLink();
  }

  async function showQr() {
    setQrOpen(true);
    if (!qrData) {
      const { toDataURL } = await import("qrcode");
      setQrData(
        await toDataURL(pageUrl(), {
          width: 320,
          margin: 2,
          color: { dark: "#312e81", light: "#ffffff" },
        }),
      );
    }
  }

  const buttonMotion = reducedMotion ? {} : { whileTap: { scale: 0.97 } };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <motion.div {...buttonMotion}>
          <Button type="button" variant="outline" onClick={share}>
            <Share2 />
            {labels.share}
          </Button>
        </motion.div>
        <motion.div {...buttonMotion}>
          <Button type="button" variant="outline" onClick={copyLink}>
            {copied ? <Check /> : <Copy />}
            {copied ? labels.copied : labels.copy}
          </Button>
        </motion.div>
        <motion.div {...buttonMotion}>
          <Button type="button" variant="outline" onClick={showQr}>
            <QrCode />
            {labels.qr}
          </Button>
        </motion.div>
      </div>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{labels.qr}</DialogTitle>
            <DialogDescription>{labels.qrDescription}</DialogDescription>
          </DialogHeader>
          <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-xl border bg-white">
            {qrData ? (
              <Image
                src={qrData}
                alt={labels.qr}
                fill
                sizes="288px"
                unoptimized
                className="object-contain p-3"
              />
            ) : (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
