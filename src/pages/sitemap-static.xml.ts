import type { APIRoute } from 'astro';
import { buildStaticUrls, renderUrlSet, xmlResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => xmlResponse(renderUrlSet(buildStaticUrls()));
