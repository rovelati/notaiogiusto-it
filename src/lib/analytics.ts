/** GA4 measurement ID (stream NotaioGiusto). Override with PUBLIC_GA_MEASUREMENT_ID. */
export function getGaMeasurementId() {
  return String(
    import.meta.env.PUBLIC_GA_MEASUREMENT_ID ||
      process.env.PUBLIC_GA_MEASUREMENT_ID ||
      'G-NDREZNGP80',
  ).trim();
}
