FROM mcr.microsoft.com/devcontainers/javascript-node:20-bookworm

# Install Tauri system dependencies and SQLite
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust as the node user (not root)
USER node
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile default

# Add cargo to PATH for node user
ENV PATH="/home/node/.cargo/bin:${PATH}"

# Enable corepack for pnpm (no global install needed)
USER root
RUN corepack enable

USER node
