import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Text, TextInput } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import { captureRef } from 'react-native-view-shot';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// react-native-signature-canvas renders its drawing surface inside a
// react-native-webview WebView, which has no web implementation (it renders
// a "does not support this platform" stub - confirmed in
// node_modules/react-native-webview/src/WebView.tsx). Web gets a hand-rolled
// <canvas> pad instead, exposing the same onOK(dataUri)/onEmpty callback
// shape and imperative readSignature()/clearSignature() ref API so
// app/inspection/signatures.js doesn't need to know which one is active.
//
// mode='initials' swaps the draw surface for a typed-initials pad instead
// (see InitialsPad below) - same ref/callback contract either way.
const SignaturePad = forwardRef(function SignaturePad(
  { mode = 'draw', onOK, onEmpty, onBegin, onEnd, penColor = '#173a3d' },
  ref
) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  if (mode === 'initials') {
    return (
      <View style={styles.pad}>
        <InitialsPad ref={ref} onOK={onOK} onEmpty={onEmpty} />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.pad}>
        <WebCanvasPad ref={ref} onOK={onOK} onEmpty={onEmpty} onBegin={onBegin} onEnd={onEnd} penColor={penColor} />
      </View>
    );
  }

  // react-native-signature-canvas's own ref already exposes readSignature()/
  // clearSignature() with the exact shape this component's callers expect -
  // forwarded straight through, no wrapping needed.
  return (
    <View style={styles.pad}>
      <SignatureScreen
        ref={ref}
        onOK={onOK}
        onEmpty={onEmpty}
        onBegin={onBegin}
        onEnd={onEnd}
        penColor={penColor}
        backgroundColor="transparent"
        autoClear={false}
        trimWhitespace
        webStyle=".m-signature-pad--footer { display: none; margin: 0; } .m-signature-pad--body { border: none; } .m-signature-pad { box-shadow: none; border: none; } body, html { background-color: transparent; }"
      />
    </View>
  );
});

const WebCanvasPad = forwardRef(function WebCanvasPad({ onOK, onEmpty, onBegin, onEnd, penColor }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = penColor;
  }, [penColor]);

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawnRef.current) {
        onEmpty && onEmpty();
        return;
      }
      onOK && onOK(canvas.toDataURL('image/png'));
    },
    clearSignature: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
    },
  }));

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    onBegin && onBegin();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    hasDrawnRef.current = true;
  };

  const handlePointerUp = (e) => {
    e.preventDefault();
    if (drawingRef.current) {
      drawingRef.current = false;
      onEnd && onEnd();
    }
  };

  return React.createElement('canvas', {
    ref: canvasRef,
    width: 600,
    height: 220,
    style: { width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' },
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerLeave: handlePointerUp,
  });
});

// Typed-initials alternative to freehand drawing - the initials are styled
// in a signature-like script font (FONTS.signature) and rasterized to a PNG.
// On native, react-native-view-shot's captureRef screenshots the styled
// <Text> preview directly. On web, captureRef's generic path always calls
// react-native-web's findNodeHandle first, which throws
// ("findNodeHandle is not supported on web") for this kind of ref before it
// ever reaches its own html2canvas fallback - confirmed live, not just from
// docs - so web draws the initials straight onto a <canvas> instead (same
// technique as WebCanvasPad above), sidestepping findNodeHandle entirely.
const InitialsPad = forwardRef(function InitialsPad({ onOK, onEmpty }, ref) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [initials, setInitials] = useState('');
  const previewRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!initials) return;
    const fontSpec = `56px "${FONTS.signature}"`;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSpec;
      ctx.fillStyle = colors.textPrimary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, canvas.width / 2, canvas.height / 2);
    };
    // document.fonts.load() makes sure the script font is actually decoded
    // before we draw - canvas text silently falls back to a system font
    // otherwise, unlike DOM text which repaints once the font arrives.
    if (typeof document !== 'undefined' && document.fonts?.load) {
      document.fonts.load(fontSpec).then(draw).catch(draw);
    } else {
      draw();
    }
  }, [initials, colors.textPrimary]);

  useImperativeHandle(ref, () => ({
    readSignature: async () => {
      const trimmed = initials.trim();
      if (!trimmed) {
        onEmpty && onEmpty();
        return;
      }
      if (Platform.OS === 'web') {
        const canvas = canvasRef.current;
        if (!canvas) {
          onEmpty && onEmpty();
          return;
        }
        onOK && onOK(canvas.toDataURL('image/png'));
        return;
      }
      try {
        const dataUri = await captureRef(previewRef, { format: 'png', quality: 1, result: 'data-uri' });
        onOK && onOK(dataUri);
      } catch (e) {
        console.error('InitialsPad capture failed:', e);
        onEmpty && onEmpty();
      }
    },
    clearSignature: () => setInitials(''),
  }));

  return (
    <View style={styles.initialsWrap}>
      <TextInput
        value={initials}
        onChangeText={(text) => setInitials(text.toUpperCase().slice(0, 4))}
        placeholder="e.g. JD"
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="characters"
        maxLength={4}
        style={styles.initialsInput}
      />
      {Platform.OS === 'web' ? (
        <View style={styles.initialsPreview}>
          {React.createElement('canvas', {
            ref: canvasRef,
            width: 400,
            height: 90,
            style: { width: '100%', height: '100%' },
          })}
        </View>
      ) : (
        <View ref={previewRef} collapsable={false} style={styles.initialsPreview}>
          {!!initials && <Text style={styles.initialsPreviewText}>{initials}</Text>}
        </View>
      )}
    </View>
  );
});

function createStyles(colors) {
  return StyleSheet.create({
    pad: {
      height: 200,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    initialsWrap: {
      flex: 1,
      padding: 14,
      justifyContent: 'center',
      gap: 14,
    },
    initialsInput: {
      fontFamily: FONTS.semiBold,
      fontSize: 16,
      textAlign: 'center',
      letterSpacing: 2,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
    },
    initialsPreview: {
      height: 90,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 8,
    },
    initialsPreviewText: {
      fontFamily: FONTS.signature,
      fontSize: 48,
      color: colors.textPrimary,
    },
  });
}

export default SignaturePad;
