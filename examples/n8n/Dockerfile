# n8n 2.46.6 declares Node >=24.0.0 in its published npm manifest.
FROM node:24-bookworm-slim AS node_runtime
FROM openfoam/openfoam10-paraview510:latest
USER root
COPY --from=node_runtime /usr/local/ /usr/local/
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip build-essential pkg-config ca-certificates \
    unzip xvfb xauth libgl1 libglu1-mesa libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
# Build-time engine checks fail clearly if a base image changes incompatibly.
RUN node --version && npm --version \
    && npm install --prefix /opt/n8n --omit=dev n8n@2.46.6 \
    && python3 -m pip install --no-cache-dir \
    numpy==1.26.4 pyvista==0.44.2 vtk==9.3.1 matplotlib==3.9.4 gmsh==4.13.1
RUN mkdir -p /home/node/.n8n /data/runs /inputs /tmp/foam-cache \
    && chown -R 1000:1000 /home/node /data/runs /tmp/foam-cache
ENV N8N_USER_FOLDER=/home/node \
    XDG_CACHE_HOME=/tmp/foam-cache \
    MPLBACKEND=Agg \
    PYVISTA_OFF_SCREEN=true
WORKDIR /data
USER 1000:1000
EXPOSE 5678
ENTRYPOINT ["node", "/opt/n8n/node_modules/n8n/bin/n8n"]

CMD ["start"]
