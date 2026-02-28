FROM node:24

# Install deps
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install opencode
RUN curl -fsSL https://opencode.ai/install | bash

ENV PATH="/root/.local/bin:$PATH"