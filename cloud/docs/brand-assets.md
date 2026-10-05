# Original Notable brand assets

The source is the user’s `Blackbox-Technologies/Notable` macOS GitHub snapshot at `/private/tmp/notable-macos-reference-2ae1b4d`.

- **Original icon:** `Notable/Assets.xcassets/Icon.imageset/NotableCover_1024x1024.png`, also used in `AppIcon.appiconset`. Copied without modification to `assets/originals/images/notable-logo.png`; SHA-256 matches the source. It contains a white diagonal fountain-pen feather/quill, nib, handwritten underline, and one four-point star on a mint background. It is an opaque 1024 × 1024 RGB PNG, approximately 272 KB.
- **Original wordmark:** SwiftUI renders the text `Notable` in `SansitaOne`, rather than using a separate wordmark image. Verified in `Notable/View/Main Toolbar/HomePages/HomePage.swift` lines 209–210 and `Notable/View/Auth/AuthSignInPage.swift` lines 40–41. Existing `ui/public/fonts/SansitaOne.ttf` matches `Notable/Resources/Fonts/SansitaOne.ttf` byte-for-byte. Keep the capital N and original letterforms; the lowercase word with a dot is not the original branding.

No original transparent quill-only asset or separate wordmark image exists in this snapshot. A built-in imagegen background-removal attempt changed fine feather cutouts and produced noisy edges; it was rejected and was not copied into the public asset directory. Do not describe that generated edit as the exact original logo.

For the requested beige interface, the authentic Sansita wordmark can use the interface’s dark ink color. The original icon can remain the source graphic in a small badge; a grayscale display treatment would remove its green appearance while retaining the source geometry. Avoid replacing it with a generic book, feather icon, or AI sparkle symbol. The four-point star inside the original source image is part of that artwork, distinct from unrelated decorative sparkles.

## Feather-only icon

The user subsequently requested a feather-only version of the provided screenshot. Built-in Imagegen produced `assets/originals/images/notable-feather.png` with real transparency; this is a generated derivative, not an unaltered official source asset. It removes the star, underline, and square background, retaining the diagonal white quill. The original source is preserved. Prompt: isolate the existing white diagonal feather, preserve its curved silhouette and cutouts, remove star/underline/background, center with transparent padding, no shadow/glow/border/text. This derivative belonged to the earlier Notable interface. The current application uses the separate Nook brand.

## Runtime encoding

The original PNG files remain unchanged in `assets/originals/images`. Runtime copies use WebP in `ui/public/images`; their dimensions and alpha masks are preserved, while color encoding is compressed. The original Notable source logo remains available byte-for-byte in the archive. See `assets/image-encoding-manifest.json` for hashes and encoding settings.
