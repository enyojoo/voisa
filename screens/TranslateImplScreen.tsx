import Ionicons from '@expo/vector-icons/Ionicons';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  LayoutAnimation,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { useLiveKitTranslator } from '@/hooks/useLiveKitTranslator';
import { configureVoisaRuntimeLogging } from '@/lib/logging/configureClientLogging';
import { SONIOX_LANGUAGES, sonioxLanguageLabel, type SonioxLanguage } from '@/lib/sonioxLanguages';
import { useAuth } from '@/providers/AuthProvider';
import { useTranslatorLifecycle } from '@/providers/TranslatorLifecycleProvider';
import { colors, spacing } from '@/theme/tokens';

function randomRoomName(): string {
  return `voisa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const WINDOW_HEIGHT = Dimensions.get('window').height;

export default function TranslateScreenImpl() {
  const { user } = useAuth();
  const { registerTranslatorStop } = useTranslatorLifecycle();
  const lk = useLiveKitTranslator();
  const insets = useSafeAreaInsets();
  const [micError, setMicError] = useState<string | null>(null);
  const transcriptScrollRef = useRef<ScrollView>(null);
  const pickerListRef = useRef<FlatList<SonioxLanguage>>(null);

  /** Left dock pill = translate-from language; right = translate-to (Soniox pair order sent as language_a / language_b). */
  const [languageLeft, setLanguageLeft] = useState('en');
  const [languageRight, setLanguageRight] = useState('es');
  const [pickerSlot, setPickerSlot] = useState<'left' | 'right' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => {
    configureVoisaRuntimeLogging();
  }, []);

  const participantName = useMemo(() => {
    const id = user?.id;
    const email = user?.email;
    if (email && email.trim()) return email.trim().slice(0, 120);
    if (id) return `user-${id.slice(0, 18)}`;
    return `guest-${Math.random().toString(36).slice(2, 8)}`;
  }, [user]);

  /** Session chrome after LiveKit + mic are ready; cleared on stop, disconnect, or failed start. */
  const [sessionStartedOnTap, setSessionStartedOnTap] = useState(false);
  /** Immediate tap feedback while transport/audio session is arming. */
  const [isStarting, setIsStarting] = useState(false);

  const connecting = lk.connection === 'connecting';
  const active = lk.connection === 'connected' || lk.connection === 'reconnecting';
  /** UX invariant: show stop/listening only when mic is truly live (or already active/reconnecting). */
  const inSessionUi = lk.micLive || active || sessionStartedOnTap;
  const bodyFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (lk.connection === 'idle' || lk.connection === 'error') {
      setSessionStartedOnTap(false);
    }
  }, [lk.connection]);

  useEffect(() => {
    if (lk.micLive || lk.connection === 'idle' || lk.connection === 'error') {
      setIsStarting(false);
    }
  }, [lk.micLive, lk.connection]);

  useEffect(() => {
    if (lk.micLive) setSessionStartedOnTap(true);
  }, [lk.micLive]);

  /** Voisa bilingual stream (authoritative when present). */
  const hasVoisaOriginal = lk.liveOriginal.trim().length > 0;
  const hasVoisaTranslated = lk.liveTranslated.trim().length > 0;
  const hasVoisaLive = hasVoisaOriginal || hasVoisaTranslated;
  /** LiveKit Agents user captions — can arrive before `voisa.transcript` partials; must not leave UI on “Listening…”. */
  const hasLkCaption = lk.liveUserTranscriptLk.trim().length > 0;

  const listeningIdle =
    inSessionUi &&
    lk.micLive &&
    lk.segments.length === 0 &&
    !hasVoisaLive &&
    !hasLkCaption;

  /**
   * Paired live card prefers voisa originals. If only translated text exists, require lk captions for source context
   * instead of rendering a `...` source line that looks like a ghost frame.
   */
  const hasLiveLine = inSessionUi && (hasVoisaOriginal || (hasVoisaTranslated && hasLkCaption));

  /** Single-column fallback when captions exist but Soniox bridge has not painted voisa lines yet. */
  const showLkCaptionOnly =
    inSessionUi && lk.segments.length === 0 && !hasVoisaOriginal && !hasVoisaTranslated && hasLkCaption;

  const bodyViewMode: 'home' | 'listening' | 'transcript' = !inSessionUi
    ? 'home'
    : listeningIdle
      ? 'listening'
      : 'transcript';

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    bodyFade.setValue(0.9);
    Animated.timing(bodyFade, {
      toValue: 1,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [bodyFade, bodyViewMode]);

  const liveOriginalDisplay = hasVoisaOriginal
    ? lk.liveOriginal.trim()
    : hasLkCaption
      ? lk.liveUserTranscriptLk.trim()
      : '';

  /**
   * Three pulsing dots shown in the translated slot while original tokens are arriving but Soniox has not emitted
   * translation tokens for the current chunk yet (real-time translation is interleaved per
   * https://soniox.com/docs/stt/rt/real-time-translation — small lead time between original and translation
   * chunks). Sized to match the translated text so the live card never collapses or appears empty.
   */
  const dot1 = useRef(new Animated.Value(0.25)).current;
  const dot2 = useRef(new Animated.Value(0.25)).current;
  const dot3 = useRef(new Animated.Value(0.25)).current;
  const showTranslatingPulse =
    hasLiveLine && !hasVoisaTranslated && liveOriginalDisplay.length > 0;
  useEffect(() => {
    if (!showTranslatingPulse) {
      dot1.setValue(0.25);
      dot2.setValue(0.25);
      dot3.setValue(0.25);
      return;
    }
    const bounce = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 280, useNativeDriver: true }),
          Animated.delay(180),
        ]),
      );
    const a = bounce(dot1, 0);
    const b = bounce(dot2, 140);
    const c = bounce(dot3, 280);
    a.start();
    b.start();
    c.start();
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [showTranslatingPulse, dot1, dot2, dot3]);

  const showLkCaptionDebug =
    __DEV__ &&
    typeof process.env.EXPO_PUBLIC_VOISA_DEBUG_LK_CAPTIONS === 'string' &&
    process.env.EXPO_PUBLIC_VOISA_DEBUG_LK_CAPTIONS === '1';

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      transcriptScrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [active, lk.segments.length, lk.liveTranslated, lk.liveOriginal, lk.liveUserTranscriptLk]);

  /**
   * Push language pair when the UI changes mid-session.
   * Must NOT run during `connecting` / `reconnecting`: `useLiveKitTranslator` already publishes after ICE reaches
   * Connected and republishes on reconnect — screen publishes here only once LiveKit reports `connected`.
   */
  useEffect(() => {
    if (!inSessionUi) return;
    if (lk.connection === 'error') return;
    if (lk.connection !== 'connected') return;
    void lk.publishLanguagePair(languageLeft, languageRight, { waitMs: 8000 });
  }, [inSessionUi, lk.connection, languageLeft, languageRight, lk.publishLanguagePair]);

  const swapLanguages = useCallback(() => {
    setLanguageLeft(languageRight);
    setLanguageRight(languageLeft);
  }, [languageLeft, languageRight]);

  const pickLanguage = useCallback((slot: 'left' | 'right', code: string) => {
    Keyboard.dismiss();
    const c = code.trim().toLowerCase();
    if (slot === 'left') {
      if (c === languageRight) {
        setLanguageRight(languageLeft);
        setLanguageLeft(c);
      } else {
        setLanguageLeft(c);
      }
    } else if (c === languageLeft) {
      setLanguageLeft(languageRight);
      setLanguageRight(c);
    } else {
      setLanguageRight(c);
    }
    setPickerSlot(null);
  }, [languageLeft, languageRight]);

  useEffect(() => {
    if (pickerSlot === null) setPickerQuery('');
  }, [pickerSlot]);

  const filteredPickerLanguages = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const base = q
      ? SONIOX_LANGUAGES.filter(
          (l) =>
            l.label.toLowerCase().includes(q) ||
            l.code.toLowerCase().includes(q),
        )
      : SONIOX_LANGUAGES;

    if (!pickerSlot) return base;

    const sel =
      pickerSlot === 'left'
        ? languageLeft.trim().toLowerCase()
        : languageRight.trim().toLowerCase();

    const selectedItem = base.find((l) => l.code === sel);
    if (!selectedItem) return base;

    const rest = base.filter((l) => l.code !== sel);
    return [selectedItem, ...rest];
  }, [pickerQuery, pickerSlot, languageLeft, languageRight]);

  useEffect(() => {
    if (pickerSlot === null) return;
    const id = requestAnimationFrame(() => {
      pickerListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [pickerSlot, pickerQuery, filteredPickerLanguages]);

  const closePicker = useCallback(() => {
    Keyboard.dismiss();
    setPickerSlot(null);
  }, []);

  const start = useCallback(() => {
    void (async () => {
      if (isStarting) return;
      setIsStarting(true);
      setMicError(null);
      lk.clearSegments();

      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setSessionStartedOnTap(false);
        setIsStarting(false);
        setMicError('Microphone permission is required.');
        return;
      }

      /** iOS: LiveKit/WebRTC configures AVAudioSession in prepareLiveKitAudioSession — expo-audio here fights it and can throw OSStatus 561017449 (“setting category”). */
      if (Platform.OS === 'android') {
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
            interruptionMode: 'mixWithOthers',
            shouldRouteThroughEarpiece: false,
            shouldPlayInBackground: false,
          });
        } catch {
          /* transient category conflicts while another subsystem holds the session */
        }
      }

      const roomName = randomRoomName();
      try {
        await lk.startSession({
          roomName,
          participantName,
          languageA: languageLeft,
          languageB: languageRight,
        });
        setSessionStartedOnTap(true);
      } catch {
        setSessionStartedOnTap(false);
        setIsStarting(false);
        /** `lastError` + connection state surfaced in banners */
      }
    })();
  }, [isStarting, lk, participantName, languageLeft, languageRight]);

  const stop = useCallback(async () => {
    setIsStarting(false);
    setSessionStartedOnTap(false);
    await lk.stopSession();
  }, [lk]);

  const toggleSession = useCallback(() => {
    if (isStarting) return;
    if (connecting && !inSessionUi) return;
    if (inSessionUi) void stop();
    else void start();
  }, [isStarting, connecting, inSessionUi, start, stop]);

  useEffect(() => {
    registerTranslatorStop(stop);
    return () => registerTranslatorStop(null);
  }, [stop, registerTranslatorStop]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />

      {lk.lastError ? <Text style={styles.banner}>{lk.lastError}</Text> : null}
      {lk.agentNotice ? <Text style={styles.banner}>{lk.agentNotice}</Text> : null}
      {micError ? <Text style={styles.banner}>{micError}</Text> : null}

      <Animated.View style={[styles.body, { opacity: bodyFade }]}>
        {bodyViewMode === 'home' ? (
          <View style={styles.bodyCenter}>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Live Translator</Text>
              <Text style={styles.heroSubtitle}>Tap mic to translate in real-time</Text>
            </View>
          </View>
        ) : bodyViewMode === 'listening' ? (
          <View style={styles.bodyCenter}>
            <View style={styles.hero}>
              <Text style={styles.listening}>Listening…</Text>
            </View>
          </View>
        ) : (
          <ScrollView
            ref={transcriptScrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            accessibilityLiveRegion="polite"
          >
            {lk.segments.map((item) => {
              /**
               * If the live partial is a continuation of THIS segment (sliding pause window), render it inline so
               * the user sees ONE growing card per thread — no separate "live" card flashing in/out below.
               */
              const isContinuation = lk.liveContinuationSegmentId === item.id;
              const continuationTranslated = isContinuation
                ? lk.liveTranslated.trim()
                : '';
              const continuationOriginal = isContinuation
                ? hasVoisaOriginal
                  ? lk.liveOriginal.trim()
                  : hasLkCaption
                    ? lk.liveUserTranscriptLk.trim()
                    : ''
                : '';
              const showInlinePulse =
                isContinuation && !continuationTranslated && (continuationOriginal.length > 0);
              const translatedDisplay = continuationTranslated
                ? `${item.translated.trim()} ${continuationTranslated}`.trim()
                : item.translated.trim();
              const originalDisplay = continuationOriginal
                ? `${item.original.trim()} ${continuationOriginal}`.trim()
                : item.original.trim();
              return (
                <View key={item.id} style={styles.transcriptCard}>
                  <Text
                    style={styles.originalSecondary}
                    selectable
                    accessibilityHint={`Spoken (${sonioxLanguageLabel(languageLeft)})`}
                  >
                    {originalDisplay || '…'}
                  </Text>

                  <View style={styles.transcriptDivider} />

                  {translatedDisplay ? (
                    <Text
                      style={styles.translationPrimary}
                      selectable
                      accessibilityHint={`Translated (${sonioxLanguageLabel(languageRight)})`}
                    >
                      {translatedDisplay}
                    </Text>
                  ) : null}
                  {showInlinePulse ? (
                    <View
                      style={styles.translatingPulseRow}
                      accessibilityLabel="Translating"
                      accessibilityHint={`Translating to ${sonioxLanguageLabel(languageRight)}`}
                    >
                      <Animated.View style={[styles.translatingDot, { opacity: dot1 }]} />
                      <Animated.View style={[styles.translatingDot, { opacity: dot2 }]} />
                      <Animated.View style={[styles.translatingDot, { opacity: dot3 }]} />
                    </View>
                  ) : null}
                  {!translatedDisplay && !showInlinePulse ? (
                    <Text
                      style={styles.translationPrimary}
                      selectable={false}
                      accessibilityHint={`Translated (${sonioxLanguageLabel(languageRight)})`}
                    >
                      …
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {showLkCaptionOnly ? (
              <View style={styles.transcriptCard} accessibilityLiveRegion="polite">
                <Text style={styles.lkCaptionHint} selectable={false}>
                  Live captions (LiveKit)
                </Text>
                <Text
                  style={styles.originalSecondary}
                  selectable
                  accessibilityHint={`Heard (${sonioxLanguageLabel(languageLeft)})`}
                >
                  {lk.liveUserTranscriptLk.trim()}
                </Text>
                <Text style={styles.lkCaptionSubhint} selectable={false}>
                  Paired translation appears when the translator stream connects.
                </Text>
              </View>
            ) : null}

            {hasLiveLine && lk.liveContinuationSegmentId === null ? (
              <View style={styles.transcriptCard} accessibilityLiveRegion="polite">
                <Text
                  style={styles.originalSecondary}
                  selectable
                  accessibilityHint={`Spoken (${sonioxLanguageLabel(languageLeft)})`}
                >
                  {liveOriginalDisplay}
                </Text>

                <View style={styles.transcriptDivider} />

                {hasVoisaTranslated ? (
                  <Text
                    style={styles.translationPrimary}
                    selectable
                    accessibilityHint={`Translated (${sonioxLanguageLabel(languageRight)})`}
                  >
                    {lk.liveTranslated.trim()}
                  </Text>
                ) : (
                  <View
                    style={styles.translatingPulseRow}
                    accessibilityLabel="Translating"
                    accessibilityHint={`Translating to ${sonioxLanguageLabel(languageRight)}`}
                  >
                    <Animated.View style={[styles.translatingDot, { opacity: dot1 }]} />
                    <Animated.View style={[styles.translatingDot, { opacity: dot2 }]} />
                    <Animated.View style={[styles.translatingDot, { opacity: dot3 }]} />
                  </View>
                )}
              </View>
            ) : null}

            {showLkCaptionDebug && lk.liveUserTranscriptLk.trim().length > 0 ? (
              <View style={styles.debugLkCaption} accessibilityLabel="LiveKit caption debug">
                <Text style={styles.debugLkCaptionLabel}>lk.transcription (debug)</Text>
                <Text style={styles.debugLkCaptionText} selectable>
                  {lk.liveUserTranscriptLk.trim()}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </Animated.View>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.langRow}>
          <Pressable
            style={styles.langPill}
            onPress={() => setPickerSlot('left')}
            accessibilityRole="button"
          >
            <Text style={styles.langPillText} numberOfLines={1}>
              {sonioxLanguageLabel(languageLeft)}
            </Text>
          </Pressable>
          <Pressable
            style={styles.swapBtn}
            onPress={swapLanguages}
            accessibilityRole="button"
            accessibilityLabel="Swap languages"
            hitSlop={12}
          >
            <Ionicons name="swap-horizontal" size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.langPill}
            onPress={() => setPickerSlot('right')}
            accessibilityRole="button"
          >
            <Text style={styles.langPillText} numberOfLines={1}>
              {sonioxLanguageLabel(languageRight)}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.micFab}
          onPress={() => void toggleSession()}
          disabled={isStarting}
          accessibilityRole="button"
          accessibilityLabel={
            isStarting
              ? 'Starting microphone'
              : inSessionUi
                ? 'Stop translation session'
                : 'Start translation session'
          }
        >
          {isStarting ? (
            <ActivityIndicator size="small" color="#fff" style={styles.micSpinner} />
          ) : (
            <Ionicons
              name={inSessionUi ? 'stop-circle' : 'mic'}
              size={inSessionUi ? 44 : 38}
              color="#fff"
            />
          )}
        </Pressable>
      </View>

      <Modal
        visible={pickerSlot !== null}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={styles.modalOuter}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={closePicker}
            accessibilityRole="button"
            accessibilityLabel="Dismiss language picker"
          />
          <SafeAreaView style={styles.modalSafeTop} edges={['top', 'left', 'right']} pointerEvents="box-none">
            <KeyboardAvoidingView
              style={styles.modalKbRoot}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
              pointerEvents="box-none"
            >
              <View style={styles.modalRoot} pointerEvents="box-none">
                <View
                  style={[
                    styles.modalSheet,
                    {
                      height: Math.round(WINDOW_HEIGHT * 0.62),
                      maxHeight: Math.round(WINDOW_HEIGHT * 0.88),
                      paddingBottom: Math.max(insets.bottom, spacing.md),
                    },
                  ]}
                  pointerEvents="auto"
                >
                  <Text style={styles.modalTitle}>
                    {pickerSlot === 'left' ? 'Translate from' : 'Translate to'}
                  </Text>

                  <View style={styles.searchRow}>
                    <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
                    <TextInput
                      style={styles.searchInput}
                      value={pickerQuery}
                      onChangeText={setPickerQuery}
                      placeholder="Search languages"
                      placeholderTextColor={colors.textMuted}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {pickerQuery.length > 0 ? (
                      <Pressable
                        onPress={() => setPickerQuery('')}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                      >
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>

                  <FlatList
                    ref={pickerListRef}
                    data={filteredPickerLanguages}
                    keyExtractor={(item) => item.code}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    style={styles.modalList}
                    renderItem={({ item }) => {
                      const selectedCode =
                        pickerSlot === 'left'
                          ? languageLeft.trim().toLowerCase()
                          : languageRight.trim().toLowerCase();
                      const isSelected = item.code === selectedCode;
                      return (
                        <Pressable
                          style={[styles.modalRow, isSelected && styles.modalRowSelected]}
                          onPress={() => pickerSlot && pickLanguage(pickerSlot, item.code)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[styles.modalRowLabel, isSelected && styles.modalRowLabelSelected]}
                            numberOfLines={2}
                          >
                            {item.label}
                          </Text>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                          ) : null}
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={
                      <Text style={styles.modalEmpty}>{`No languages match "${pickerQuery.trim()}".`}</Text>
                    }
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: 14,
  },
  body: { flex: 1 },
  bodyCenter: { flex: 1, justifyContent: 'center' },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    maxWidth: 420,
    alignSelf: 'center',
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.navy,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listening: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.navy,
    textAlign: 'center',
  },
  listeningInScroll: {
    minHeight: WINDOW_HEIGHT * 0.42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lkCaptionHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  lkCaptionSubhint: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  debugLkCaption: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  debugLkCaptionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  debugLkCaptionText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textSecondary,
  },
  transcriptScroll: { flex: 1 },
  transcriptScrollContent: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  transcriptCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  translationPrimary: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.35,
  },
  /**
   * Three-dot bouncing indicator that occupies the same vertical slot as `translationPrimary` (lineHeight 34)
   * so the live card height is stable whether translation text or the indicator is rendering.
   */
  translatingPulseRow: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  translatingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.text,
  },
  /** Breathing room between the small source line (top) and the large translation block (below). */
  transcriptDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'stretch',
    opacity: 0.85,
  },
  originalSecondary: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  langPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  langPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    width: '100%',
    textAlign: 'center',
  },
  swapBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  micFab: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primaryRing,
    marginBottom: spacing.sm,
  },
  micSpinner: {
    transform: [{ scale: 1.2 }],
  },
  modalOuter: {
    flex: 1,
  },
  modalSafeTop: {
    flex: 1,
  },
  modalKbRoot: {
    flex: 1,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    width: '100%',
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 44,
    backgroundColor: colors.background,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: spacing.xs,
  },
  modalList: { flex: 1 },
  modalEmpty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 15,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRowSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.09)',
    borderRadius: 10,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.sm + spacing.xs,
    borderBottomColor: 'transparent',
  },
  modalRowLabel: { flex: 1, fontSize: 16, color: colors.text },
  modalRowLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
