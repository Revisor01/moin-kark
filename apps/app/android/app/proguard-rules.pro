# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# --- Ab hier fuer R8 (minifyEnabled), ergaenzt 26.09.2026 ---
#
# R8 entfernt, was es fuer unbenutzt haelt. Was nur ueber Reflection oder aus
# nativem Code gerufen wird, sieht es nicht — das faellt dann erst zur Laufzeit
# auf, im Release, auf dem Geraet. Diese Regeln decken die Stellen ab, an denen
# das bei React Native erfahrungsgemaess passiert.

# React Native: Bruecke zwischen JS und nativem Code, komplett ueber Reflection.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers @com.facebook.proguard.annotations.DoNotStrip class * { *; }

# Hermes (die JS-Engine) laedt ueber JNI.
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.soloader.** { *; }

# MapLibre: die Karte. Ruft aus C++ zurueck ins Java.
-keep class org.maplibre.android.** { *; }
-keep class org.maplibre.geojson.** { *; }
-dontwarn org.maplibre.**

# Expo-Module werden ueber ihren Klassennamen gefunden.
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }

# Kotlin-Metadaten: ohne sie brechen Coroutinen und Reflection.
-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

# okhttp/okio (der Netzwerkweg) — bekannte Warnungen ohne Folgen.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
