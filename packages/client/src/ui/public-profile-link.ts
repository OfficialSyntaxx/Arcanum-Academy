const PUBLIC_PROFILE_ID = /^[A-Za-z0-9_-]{8,80}$/;

/** A same-origin deep link; the opaque ID is the only identifier it carries. */
export function publicProfileLink(currentHref: string, publicId: string): string | null {
  if (!PUBLIC_PROFILE_ID.test(publicId)) return null;
  try {
    const url = new URL(currentHref);
    url.searchParams.set('profile', publicId);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function publicProfileIdFromUrl(currentHref: string): string | null {
  try {
    const publicId = new URL(currentHref).searchParams.get('profile');
    return publicId !== null && PUBLIC_PROFILE_ID.test(publicId) ? publicId : null;
  } catch {
    return null;
  }
}

export function clearPublicProfileLink(currentHref: string): string | null {
  try {
    const url = new URL(currentHref);
    url.searchParams.delete('profile');
    return url.toString();
  } catch {
    return null;
  }
}
