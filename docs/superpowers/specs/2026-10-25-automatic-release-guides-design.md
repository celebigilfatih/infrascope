# Automatic customer release guides

The customer needs the existing Turkish Windows/vSphere guide as both HTML and PDF in every new stable GitHub Release, with the exact release version, repository, download URLs and installer checksum.

Use the existing HTML design as a version-neutral template. Generate both formats from the already-built online installer ZIP and its separate bootstrap asset, rather than inferring a version from package.json or replacing an old release number in generated files. Validate the ZIP metadata, bootstrap checksum and command parameter contracts before rendering. Read the backup service name from the packaged Compose override.

Alternatives considered: manually versioned documents remain prone to drift; a second PDF content source would drift from HTML. A single template plus the existing Playwright toolchain preserves the approved design and gives both formats identical commands. This is an implementation choice within the requested automation.

Publish the HTML, PDF and separate guide checksums alongside the original installer assets. Generate release notes with exact-version links and hashes while retaining the existing release notes. A failure to render or verify either guide must prevent Release creation. Do not change the published v1.0.7 assets, move its tag, or create an unsolicited new release.

Regression coverage: two different versions and repositories, exact installer digest, unsafe input, mismatched/tampered packages, unresolved template placeholders, command-line preservation in PDFs, unbroken command blocks, working HTML copy/print behavior and publication wiring. No customer containers or database writes are needed.
