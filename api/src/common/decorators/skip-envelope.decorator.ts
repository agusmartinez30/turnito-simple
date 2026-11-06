import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** El handler responde el body crudo, sin `{ data }` (solo /health en MVP). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
