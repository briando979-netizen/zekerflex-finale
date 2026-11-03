# ZekerFlex Android-bouwer — bouwt per rijschool een Android-app (.aab) met
# Bubblewrap (Trusted Web Activity). JDK 17 + Android SDK + Node; Gradle en de
# Android-plugin worden al tijdens deze build opgewarmd (opwarmen.mjs), zodat
# een echte bouw niets meer hoeft te downloaden. De code (server.mjs, bouw.mjs)
# komt bij het draaien via een alleen-lezen mount op /opt/android-bouwer/code;
# de pakketten staan hier in /opt/android-bouwer/node_modules.
FROM node:24-bookworm-slim AS node

FROM eclipse-temurin:17-jdk-noble
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip curl ca-certificates util-linux \
  && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

ENV ANDROID_HOME=/opt/android-sdk \
    GRADLE_USER_HOME=/opt/gradle \
    ANDROID_BOUWER_WERK=/werk \
    npm_config_update_notifier=false
ARG CMDLINE_TOOLS=13114758
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
  && curl -fsSL -o /tmp/ct.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" \
  && unzip -q /tmp/ct.zip -d /tmp/ct && mv /tmp/ct/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
  && rm -rf /tmp/ct /tmp/ct.zip \
  && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null \
  && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-36" "build-tools;36.1.0" > /dev/null

# eigen uid: niet die van de app (1001), de Bouwer (61000) of testgebruikers op de host
RUN useradd -u 61100 -m androidbouwer \
  && mkdir -p $GRADLE_USER_HOME /werk /opt/android-bouwer \
  && chown -R androidbouwer:androidbouwer $ANDROID_HOME $GRADLE_USER_HOME /werk /opt/android-bouwer
USER androidbouwer
WORKDIR /opt/android-bouwer
COPY --chown=androidbouwer:androidbouwer package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=androidbouwer:androidbouwer bouw.mjs opwarmen.mjs ./
RUN node opwarmen.mjs && find /tmp -mindepth 1 -maxdepth 1 -user androidbouwer -exec rm -rf {} +

EXPOSE 4300
CMD ["node", "/opt/android-bouwer/code/server.mjs"]
