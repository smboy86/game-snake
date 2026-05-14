import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { gameHtml } from "./src/generated/gameHtml";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <WebView
        originWhitelist={["*"]}
        source={{ html: gameHtml, baseUrl: "" }}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        textZoom={100}
        allowsFullscreenVideo={false}
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
