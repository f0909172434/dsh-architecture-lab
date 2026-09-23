ARG BASE_IMAGE
FROM ${BASE_IMAGE} AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global --ignore-scripts --no-audit --no-fund pnpm@11.24.0
WORKDIR /opt/lab
COPY versions.json package.json ./
COPY src/runtime.mjs ./src/runtime.mjs
COPY scripts/ ./scripts/
COPY patches/ ./patches/
RUN chown -R 1000:1000 /opt/lab
USER 1000:1000
ENV HOME=/home/node
RUN node scripts/bootstrap-runtime.mjs
RUN node scripts/bootstrap-engram.mjs
RUN node scripts/bootstrap-planner.mjs
RUN mkdir -p node_modules/@kenz1117 \
    && ln -s /opt/lab/upstream/dsh-engram node_modules/@kenz1117/dsh-engram \
    && ln -s /opt/lab/upstream/dsh-plan-and-execute node_modules/dsh-plan-and-execute
COPY src/trial-agent.mjs src/completion-protocol.mjs src/planner-runner.mjs ./src/
COPY models/ /opt/models/
COPY relay.mjs /opt/lab/relay.mjs
COPY entrypoint.mjs /opt/lab/entrypoint.mjs
# The context is an explicit allowlist. It contains no tasks, judge, expected
# answers, histories, memory databases, account configuration or credentials.
RUN node state/runtime/0.1.5-rc.3/node_modules/@deepseek-ai/dsh/lib/bin.js --version
WORKDIR /work
USER 1000:1000
