// Compatibility only: old /read links now open the existing item viewer.
import { readingUrl } from './poem-links.js';
const id = new URLSearchParams(location.search).get('item');
const target = id ? readingUrl(id) : '/m';
const link = document.getElementById('viewer-link');
if (link) link.href = target;
location.replace(target + location.hash);
