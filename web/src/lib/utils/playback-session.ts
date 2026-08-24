import { createSession, type SessionCreateResponseDto } from '@immich/sdk';
import { DateTime, Duration } from 'luxon';

// Some browsers hand the URL of a <video> element to a separate media process
// (for example Stagefright on Android), which has its own cookie jar and
// therefore never sends the Immich auth cookie. Those requests come back 401
// and the player just buffers forever. Authenticate them with a short-lived
// session token in the query string instead, the same way casting does.
//
// The token has to outlive the whole playback, because the media process
// controls its own range requests and we cannot refresh mid-stream.
const TOKEN_DURATION = Duration.fromObject({ hours: 6 });

// Refresh early so a request that is about to be sent cannot land after expiry.
const EXPIRY_BUFFER = Duration.fromObject({ minutes: 5 });

let session: SessionCreateResponseDto | undefined;
let pending: Promise<SessionCreateResponseDto> | undefined;

const isValid = (candidate: SessionCreateResponseDto | undefined) => {
  if (!candidate?.expiresAt) {
    return false;
  }

  return DateTime.fromISO(candidate.expiresAt).minus(EXPIRY_BUFFER) > DateTime.now();
};

/**
 * Returns a session token usable as the `sessionKey` query parameter, reusing
 * the current one while it is still valid. Concurrent callers share one request.
 */
export const getPlaybackSessionKey = async () => {
  if (isValid(session)) {
    return session!.token;
  }

  pending ??= createSession({
    sessionCreateDto: {
      duration: TOKEN_DURATION.as('seconds'),
      deviceOS: 'Browser',
      deviceType: 'Video playback',
    },
  }).finally(() => {
    pending = undefined;
  });

  session = await pending;

  return session.token;
};

export const resetPlaybackSessionKey = () => {
  session = undefined;
};
