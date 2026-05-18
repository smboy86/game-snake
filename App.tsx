import { StatusBar } from "expo-status-bar";
import { BackHandler, StyleSheet, View } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";
import { WebView } from "react-native-webview";

import { gameHtml } from "./src/generated/gameHtml";

export default function App() {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (message.type === "exit_app") {
        BackHandler.exitApp();
      }
    } catch {
      // Ignore non-JSON game messages.
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <WebView
        originWhitelist={["*"]}
        source={{ html: gameHtml, baseUrl: "" }}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        textZoom={100}
        allowsFullscreenVideo={false}
        onMessage={handleMessage}
        style={styles.webview}
        containerStyle={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#171b45",
  },
  webview: {
    flex: 1,
    backgroundColor: "#171b45",
  },
});
