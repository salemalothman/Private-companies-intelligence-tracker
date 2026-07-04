"use client";

import { m } from "motion/react";

/**
 * Route transition: every navigation re-mounts a template (App Router
 * semantics), so each page enters with a subtle fade + 4px rise. Enter-only —
 * the App Router cannot hold unmounting pages for exit animations without
 * fragile freeze hacks, and a clean 200ms enter reads better than a janky
 * cross-fade.
 *
 * NOT triggered by company-page tab switches: UrlTabs/TabLink write the URL
 * via history.replaceState (no router navigation), so tab state never remounts
 * this template. Keep it that way — a <Link href="?tab=..."> would regress it.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}
