/**
 * Interne linking strategie voor SEO.
 * Smart ankertekst, contextbewuste links, breadcrumbs, related pages.
 */

import { SECTORS } from '@/lib/seo-sectors';
import { CITIES } from '@/lib/seo-cities';

export interface InternalLink {
  href: string;
  text: string;
  title?: string;
  rel?: 'related' | 'prev' | 'next';
  priority: number; // 0-100, hoger = belangrijker
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Genereer breadcrumb-reeks voor werkgever-pagina.
 */
export function generateEmployerBreadcrumbs(
  sectorLabel: string,
  cityName: string
): BreadcrumbItem[] {
  return [
    { label: 'ZekerFlex', href: '/' },
    { label: 'Personeel inhuren', href: '/werkgever' },
    { label: sectorLabel, href: `/werkgever/${sectorLabel.toLowerCase().replace(/\s+/g, '-')}` },
    {
      label: cityName,
      href: `/werkgever/${sectorLabel.toLowerCase().replace(/\s+/g, '-')}/${cityName.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ];
}

/**
 * Genereer breadcrumb-reeks voor werker-pagina.
 */
export function generateWorkerBreadcrumbs(
  sectorLabel: string,
  cityName: string,
  sectorSlug: string
): BreadcrumbItem[] {
  return [
    { label: 'ZekerFlex', href: '/' },
    { label: 'Vacatures', href: '/vacatures' },
    { label: sectorLabel, href: `/${sectorSlug}-vacatures` },
    {
      label: cityName,
      href: `/${sectorSlug}-vacatures/${cityName.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ];
}

/**
 * Genereer interne links naar verwante steden voor dezelfde sector (werkgever).
 */
export function generateRelatedCityLinksEmployer(
  currentCity: string,
  sectorSlug: string,
  limit: number = 5
): InternalLink[] {
  const currentCityData = CITIES.find((c) => c.slug === currentCity);
  if (!currentCityData) return [];

  // Prioriteer steden in dezelfde provincie
  const sameLinkCount = Math.ceil(limit / 2);
  const sameLinkCities = CITIES.filter(
    (c) => c.province === currentCityData.province && c.slug !== currentCity
  ).slice(0, sameLinkCount);

  const remainingLimit = limit - sameLinkCities.length;
  const otherCities = CITIES.filter(
    (c) =>
      c.province !== currentCityData.province && c.slug !== currentCity
  ).slice(0, remainingLimit);

  return [
    ...sameLinkCities.map((city) => ({
      href: `/werkgever/${sectorSlug}/${city.slug}`,
      text: `${city.name}`,
      title: `${city.name} ${SECTORS.find((s) => s.slug === sectorSlug)?.label || ''} personeel`,
      rel: 'related' as const,
      priority: 70,
    })),
    ...otherCities.map((city) => ({
      href: `/werkgever/${sectorSlug}/${city.slug}`,
      text: `${city.name}`,
      title: `${city.name} ${SECTORS.find((s) => s.slug === sectorSlug)?.label || ''} personeel`,
      rel: 'related' as const,
      priority: 50,
    })),
  ];
}

/**
 * Genereer interne links naar verwante steden voor dezelfde sector (werker).
 */
export function generateRelatedCityLinksWorker(
  currentCity: string,
  sectorSlug: string,
  limit: number = 5
): InternalLink[] {
  const currentCityData = CITIES.find((c) => c.slug === currentCity);
  if (!currentCityData) return [];

  const sameLinkCount = Math.ceil(limit / 2);
  const sameLinkCities = CITIES.filter(
    (c) => c.province === currentCityData.province && c.slug !== currentCity
  ).slice(0, sameLinkCount);

  const remainingLimit = limit - sameLinkCities.length;
  const otherCities = CITIES.filter(
    (c) =>
      c.province !== currentCityData.province && c.slug !== currentCity
  ).slice(0, remainingLimit);

  const sector = SECTORS.find((s) => s.slug === sectorSlug);
  const sectorWorkerSlug = sector?.workerSlug || sectorSlug;

  return [
    ...sameLinkCities.map((city) => ({
      href: `/${sectorWorkerSlug}/${city.slug}`,
      text: `${city.name}`,
      title: `${sectorSlug} vacatures in ${city.name}`,
      rel: 'related' as const,
      priority: 70,
    })),
    ...otherCities.map((city) => ({
      href: `/${sectorWorkerSlug}/${city.slug}`,
      text: `${city.name}`,
      title: `${sectorSlug} vacatures in ${city.name}`,
      rel: 'related' as const,
      priority: 50,
    })),
  ];
}

/**
 * Genereer interne links naar andere sectoren in dezelfde stad (werkgever).
 */
export function generateRelatedSectorLinksEmployer(
  currentSector: string,
  citySlug: string,
  limit: number = 3
): InternalLink[] {
  const otherSectors = SECTORS.filter((s) => s.slug !== currentSector).slice(
    0,
    limit
  );

  return otherSectors.map((sector) => ({
    href: `/werkgever/${sector.slug}/${citySlug}`,
    text: `${sector.label} personeel`,
    title: `${sector.label} personeel inhuren`,
    rel: 'related' as const,
    priority: 40,
  }));
}

/**
 * Genereer interne links naar andere sectoren in dezelfde stad (werker).
 */
export function generateRelatedSectorLinksWorker(
  currentSector: string,
  citySlug: string,
  limit: number = 3
): InternalLink[] {
  const otherSectors = SECTORS.filter((s) => s.slug !== currentSector).slice(
    0,
    limit
  );

  return otherSectors.map((sector) => ({
    href: `/${sector.workerSlug}/${citySlug}`,
    text: `${sector.label} vacatures`,
    title: `${sector.label} werk in deze stad`,
    rel: 'related' as const,
    priority: 40,
  }));
}

/**
 * Genereer prev/next navigatie voor pagina's.
 */
export function generatePaginationLinks(
  currentIndex: number,
  totalPages: number,
  baseUrl: string
): { prev?: InternalLink; next?: InternalLink } {
  const result: { prev?: InternalLink; next?: InternalLink } = {};

  if (currentIndex > 0) {
    result.prev = {
      href: `${baseUrl}?page=${currentIndex}`,
      text: 'Vorige pagina',
      rel: 'prev',
      priority: 30,
    };
  }

  if (currentIndex < totalPages - 1) {
    result.next = {
      href: `${baseUrl}?page=${currentIndex + 2}`,
      text: 'Volgende pagina',
      rel: 'next',
      priority: 30,
    };
  }

  return result;
}

/**
 * Converteer BreadcrumbItem[] naar JSON-LD schema.
 */
export function breadcrumbsToJsonLd(
  breadcrumbs: BreadcrumbItem[]
): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zekerflex.com';

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: `${baseUrl}${item.href}`,
    })),
  };
}

/**
 * Genereer anchor-tekst advies op basis van SEO-best practices.
 */
export function generateAnchorTextAdvice(
  sourcePageType: 'employer' | 'worker',
  targetPageType: 'employer' | 'worker',
  sectorLabel: string,
  cityName: string
): string[] {
  if (sourcePageType === 'employer' && targetPageType === 'employer') {
    return [
      `${cityName} ${sectorLabel.toLowerCase()} personeel`,
      `${sectorLabel} personeel in ${cityName}`,
      `Flexwerk ${sectorLabel.toLowerCase()} ${cityName}`,
      `Personeel inhuren in ${cityName}`,
    ];
  }

  if (sourcePageType === 'worker' && targetPageType === 'worker') {
    return [
      `${sectorLabel} vacatures in ${cityName}`,
      `Werk in ${cityName}`,
      `${cityName} ${sectorLabel.toLowerCase()} vacatures`,
      `Flexwerk ${sectorLabel.toLowerCase()}`,
    ];
  }

  if (sourcePageType === 'employer' && targetPageType === 'worker') {
    return [
      `Werkers zoeken`,
      `Beschikbare flexkrachten`,
      `Wie zijn onze werkers?`,
    ];
  }

  return [`Meer informatie`];
}
