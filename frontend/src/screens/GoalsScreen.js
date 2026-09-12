import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import api from '../api/client';
import { usePlan } from '../context/PlanContext';
import { useLanguage } from '../context/LanguageContext';
import RefreshBadge from '../components/RefreshBadge';
import {
  Txt, Card, Input, Button, Badge, Segmented, BottomSheet, EmptyState,
  ProgressBar, ProgressRing, ScreenHeader, Glow, formatUYU, formatMoney,
} from '../components/ui';
import { COLORS, SPACING, RADIUS, FONTS, categoryColor, estilos } from '../theme';

const GOAL_ICONS = [
  'home-outline', 'car-outline', 'airplane-outline', 'laptop-outline',
  'school-outline', 'heart-outline', 'cash-outline', 'gift-outline',
  'trophy-outline', 'star-outline',
];

// La moneda se elige al crear la meta y no se cambia despues: los depositos se
// guardan en la moneda de la meta, asi que cambiarla dejaria un historial que
// dice una cosa y un objetivo que dice otra. En Uruguay una meta para una casa
// o un auto casi siempre esta en dolares.
const FORM_VACIO = { name: '', target_amount: '', target_date: '', icon: 'trophy-outline', currency: 'UYU' };

/**
 * Tarjeta de meta. La línea de proyección es lo más importante: "llegás en ~4
 * meses" responde la pregunta que trae al usuario, y el porcentaje sólo la
 * ilustra.
 */
function GoalCard({ goal, feas, onDeposit, onDelete }) {
  const current = parseFloat(goal.current_amount);
  const target = parseFloat(goal.target_amount);
  const progress = Math.min(current / target, 1);
  const tono = goal.is_completed ? COLORS.income : COLORS.primary;

  // Los insights vienen calculados del backend.
  const ins = goal.insights;
  const proj = ins?.projection;
  const streak = ins?.streak || 0;
  const quota = ins?.monthlyQuota;
  // {amount, dia, mesesComparados} — o null cuando no hay con que comparar
  // (sin movimientos cargados este mes, o menos de dos meses de historial).
  const surplus = ins?.savingsSurplus || null;

  const projText = (() => {
    if (goal.is_completed) return null;
    if (proj?.status === 'ok') {
      const m = proj.monthsLeft;
      if (m < 1) return 'Llegás en menos de 1 mes 🎉';
      if (m === 1) return 'Llegás en ~1 mes';
      return `Llegás en ~${m} meses`;
    }
    if (quota) return `Necesitás ${formatMoney(quota, goal.currency)}/mes para llegar`;
    return null;
  })();

  const subText = (() => {
    if (goal.is_completed || !projText) return null;
    if (proj?.status === 'ok' && quota) return `Ahorrando ${formatMoney(quota, goal.currency)}/mes llegarías antes`;
    if (proj?.status === 'ok') return `Ritmo actual: ${formatMoney(proj.avgPerMonth, goal.currency)}/mes`;
    return 'Hacé tu primer depósito para ver la proyección';
  })();

  return (
    <Card variant={goal.is_completed ? 'best' : 'base'} style={styles.goal}>
      <View style={styles.goalTop}>
        <ProgressRing value={progress} size="md" color={tono} />

        <View style={styles.goalInfo}>
          <View style={styles.goalHead}>
            <Txt variant="h2" style={styles.goalName} numberOfLines={1}>{goal.name}</Txt>
            {streak >= 3 ? <Badge variant="streak" label={`${streak}d`} /> : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={15} color={COLORS.textLow} />
            </Pressable>
          </View>

          <View style={styles.goalAmounts}>
            <Txt style={[styles.goalCurrent, { color: tono }]}>{formatMoney(current, goal.currency)}</Txt>
            <Txt variant="caption" color={COLORS.textLow} style={styles.goalSep}> de </Txt>
            <Txt style={styles.goalTarget}>{formatMoney(target, goal.currency)}</Txt>
          </View>
        </View>
      </View>

      <ProgressBar value={current} max={target} color={tono} style={{ marginTop: SPACING.s }} />

      {goal.is_completed ? (
        <View style={styles.completada}>
          <Ionicons name="checkmark-circle" size={14} color={COLORS.income} />
          <Txt variant="caption" color={COLORS.income} style={{ marginLeft: 6 }}>
            ¡Meta alcanzada! 🎉
          </Txt>
        </View>
      ) : (
        <View style={styles.goalBottom}>
          <View style={{ flex: 1, marginRight: SPACING.s }}>
            {projText ? (
              <>
                <Txt variant="caption" color={COLORS.textHigh} style={styles.proj}>{projText}</Txt>
                {subText ? (
                  <Txt variant="caption" color={COLORS.textLow} style={{ marginTop: 2 }}>{subText}</Txt>
                ) : null}
              </>
            ) : (
              <Txt variant="caption" color={COLORS.textLow}>
                Hacé tu primer depósito para ver cuándo llegás
              </Txt>
            )}
            {/* El "no llegas" va con las dos salidas, no solo. Un aviso sin
                alternativa no ayuda a decidir nada. */}
            {feas?.veredicto === 'no_alcanza' && feas.faltantePorMes > 0 ? (
              <Txt variant="caption" color={COLORS.warning} style={{ marginTop: 4 }}>
                A esa fecha no llegás: faltan {formatUYU(feas.faltantePorMes)}/mes.
                {feas.objetivoPosible > 0 ? ` En el plazo entran ${formatMoney(feas.objetivoPosible, goal.currency)}.` : ''}
              </Txt>
            ) : null}
            {surplus?.amount > 0 ? (
              <Txt variant="caption" color={COLORS.income} style={{ marginTop: 4 }}>
                💡 Vas {formatUYU(surplus.amount)} por debajo de tu promedio a esta altura del mes
              </Txt>
            ) : null}
          </View>
          <Button label="Ahorrar" size="sm" icon="add" onPress={onDeposit} />
        </View>
      )}
    </Card>
  );
}

/**
 * ¿Te da?
 *
 * Es la pregunta que trae al usuario y la que una barra de progreso no puede
 * contestar: el porcentaje dice cuánto lleva, no si va a llegar. Contestarla
 * necesita el ingreso y el gasto reales, y eso lo tenemos porque el resumen
 * del banco ya está cargado — una app de metas suelta no puede decirlo.
 *
 * Dos reglas de la card:
 *  - Si el backend no puede comparar (menos de dos meses cerrados) no se
 *    inventa un veredicto: se dice qué falta para poder darlo.
 *  - Cuando NO da, la card no se limita a avisar. Ofrece las dos salidas
 *    concretas — correr la fecha o bajar el objetivo — porque un "no llegás"
 *    sin salida es sólo una mala noticia.
 */
function FeasibilityCard({ feas, metas }) {
  if (!feas || metas === 0) return null;

  if (feas.status === 'sin_datos') {
    return (
      <Card variant="base" label="¿Te da?" style={styles.bloque}>
        <Txt variant="caption" color={COLORS.textMid}>
          Con {feas.mesesMinimos} meses de resumen cargados puedo decirte si tus metas
          entran en lo que te sobra por mes.
        </Txt>
      </Card>
    );
  }

  const { disponible, cuotaTotal, faltante, ingreso, gasto, fijos, mesesGasto } = feas;
  const sinMargen = feas.veredicto === 'sin_margen';
  const da = feas.veredicto === 'alcanza' || feas.veredicto === 'ajustado';
  // Ambar significa "cuidado con este numero", no "todavia no completaste el
  // formulario": una meta sin fecha no es una advertencia.
  const tono = da ? 'best' : (feas.veredicto === 'sin_fecha' ? 'base' : 'partial');

  const titular = sinMargen
    ? 'Hoy no te sobra nada'
    : `Te sobran ${formatUYU(disponible)} por mes`;

  const detalle = (() => {
    if (sinMargen) return `Gastás ${formatUYU(gasto)} de los ${formatUYU(ingreso)} que entran.`;
    if (feas.veredicto === 'sin_fecha') return 'Poné una fecha objetivo y te digo si llegás.';
    if (feas.veredicto === 'alcanza') return `Tus metas piden ${formatUYU(cuotaTotal)} por mes. Entra.`;
    if (feas.veredicto === 'ajustado') return `Tus metas piden ${formatUYU(cuotaTotal)} por mes. Entra justo.`;
    return `Tus metas piden ${formatUYU(cuotaTotal)} por mes: faltan ${formatUYU(faltante)}.`;
  })();

  return (
    <Card variant={tono} label="¿Te da?" style={styles.bloque}>
      <Txt style={styles.feasTitular} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {titular}
      </Txt>
      <Txt variant="caption" color={COLORS.textMid} style={{ marginTop: 4 }}>{detalle}</Txt>

      {fijos.total > 0 ? (
        <Txt variant="caption" color={COLORS.textLow} style={{ marginTop: SPACING.xs }}>
          De tu gasto, {formatUYU(fijos.total)} son fijos (suscripciones y cuentas).
        </Txt>
      ) : null}

      {/* La regla de honestidad tiene componente, no letra chica: esto es un
          promedio de meses cerrados, no una cifra de este mes. */}
      <View style={styles.feasPie}>
        <Badge variant="estimate" label={`Promedio de ${mesesGasto} ${mesesGasto === 1 ? 'mes' : 'meses'}`} />
      </View>
    </Card>
  );
}

/**
 * "¿Esto fue un ahorro?"
 *
 * Hasta acá, "Ahorrar" era escribir un número: no probaba que la plata se
 * hubiera movido. Estos son movimientos que el banco ya registró, esperando que
 * el usuario diga a qué meta van.
 *
 * Dos decisiones:
 *  - Cada fila dice POR QUÉ aparece ("es una transferencia, monto redondo").
 *    La app no sabe si esa transferencia fue a tu caja de ahorro o a un amigo
 *    — el resumen no lo dice — así que muestra su evidencia y deja decidir.
 *  - El "Deshacer" queda EN PANTALLA, no en un toast que se va. Lo que dispara
 *    la acreditación es una sugerencia, y una sugerencia se equivoca; si la
 *    forma de arreglarlo dura tres segundos, en la práctica no existe.
 */
function CandidatesCard({ candidatos, acreditados, onElegir, onDeshacer }) {
  if (candidatos.length === 0 && acreditados.length === 0) return null;

  return (
    <Card variant="base" label="¿Esto fue un ahorro?" style={styles.bloque}>
      {candidatos.length > 0 ? (
        <Txt variant="caption" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
          Movimientos de tu banco que podrían ir a una meta.
        </Txt>
      ) : null}

      {candidatos.map((c) => (
        <Pressable key={c.id} onPress={() => onElegir(c)} style={styles.cand}>
          <View style={styles.candInfo}>
            <Txt variant="body" color={COLORS.textHigh} numberOfLines={1}>{c.description}</Txt>
            <Txt variant="caption" color={COLORS.textLow} numberOfLines={1}>
              {new Date(c.date).toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })}
              {c.motivos.length > 0 ? ` · ${c.motivos.join(', ')}` : ''}
            </Txt>
          </View>
          <Txt style={styles.candMonto}>{formatMoney(c.amount, c.currency)}</Txt>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textLow} />
        </Pressable>
      ))}

      {acreditados.map((a) => (
        <View key={a.id} style={styles.cand}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={{ marginRight: SPACING.s }} />
          <View style={styles.candInfo}>
            <Txt variant="caption" color={COLORS.textMid} numberOfLines={1}>
              {formatUYU(a.amount)} a {a.metaNombre}
            </Txt>
          </View>
          <Button label="Deshacer" variant="ghost" size="sm" onPress={() => onDeshacer(a)} />
        </View>
      ))}
    </Card>
  );
}

/**
 * El gasto del mes, medido en la cuota de la meta.
 *
 *   "Restaurantes  $4.200/mes  0,4 meses"
 *
 * NO dice que nada sea un derroche, y es a proposito. Si $4.200 de delivery es
 * un derroche depende del ingreso de esa persona y de su vida; la app no lo sabe
 * y llamarlo asi seria un juicio moral disfrazado de estadistica. Lo que hace es
 * una division entre dos numeros que el usuario ya conoce — lo que gasta, y la
 * cuota que el mismo se puso — y lo deja decidir.
 *
 * Tampoco marca categorias como prescindibles: las ordena por monto, sin
 * adjetivos. El usuario sabe que la luz no es opcional.
 */
function CostCard({ costos }) {
  if (!costos || costos.status !== 'ok') return null;

  return (
    <Card variant="base" label="Medido en tu meta" style={styles.bloque}>
      <Txt variant="caption" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
        Tu gasto mensual, en cuotas de {costos.meta.name} ({formatUYU(costos.meta.cuota)}/mes).
      </Txt>

      {costos.categorias.map((c) => (
        <View key={c.categoria} style={styles.costoFila}>
          <View style={styles.costoPunto}>
            <View style={[styles.costoDot, { backgroundColor: categoryColor(c.categoria) }]} />
            <Txt variant="body" color={COLORS.textHigh} numberOfLines={1}>{c.categoria}</Txt>
          </View>
          <Txt style={styles.costoMonto}>{formatUYU(c.mensual)}</Txt>
          <Txt variant="caption" color={COLORS.textMid} style={styles.costoMeses}>
            {c.mesesDeCuota.toLocaleString('es-UY')} {c.mesesDeCuota === 1 ? 'mes' : 'meses'}
          </Txt>
        </View>
      ))}

      <View style={styles.feasPie}>
        <Badge variant="estimate" label={`Promedio de ${costos.meses} ${costos.meses === 1 ? 'mes' : 'meses'}`} />
      </View>
    </Card>
  );
}

export default function GoalsScreen() {
  const { t } = useLanguage();
  const { isPremium, showUpgrade } = usePlan();

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [depositModal, setDepositModal] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [depositAmount, setDepositAmount] = useState('');
  const [saving, setSaving] = useState(false);
  // Viabilidad: un solo objeto para TODAS las metas, porque comparten un unico
  // margen mensual. Tres metas que solas entran pueden no entrar juntas.
  const [feasibility, setFeasibility] = useState(null);
  // Movimientos del banco que podrian ser un ahorro, y los que el usuario ya
  // acredito en esta sesion — estos ultimos siguen en pantalla con su
  // "Deshacer", porque lo que los acredito fue una sugerencia.
  const [candidatos, setCandidatos] = useState([]);
  const [acreditados, setAcreditados] = useState([]);
  const [linkModal, setLinkModal] = useState(null);
  const [costos, setCostos] = useState(null);

  const fetchGoals = useCallback(async () => {
    try {
      const { data } = await api.get('/goals');
      setGoals(data.goals);
      setFeasibility(data.feasibility || null);
      setCostos(data.costos || null);
      // Falla en silencio: es una ayuda, no puede romper la pantalla de metas.
      try {
        const { data: c } = await api.get('/goals/candidates');
        setCandidatos(c.candidates || []);
      } catch (_) { setCandidatos([]); }
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorLoad') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const createGoal = async () => {
    if (!form.name.trim() || !form.target_amount) {
      return Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    }
    setSaving(true);
    try {
      const { data } = await api.post('/goals', {
        name: form.name.trim(),
        target_amount: parseFloat(form.target_amount),
        target_date: form.target_date || undefined,
        currency: form.currency,
      });
      setGoals((prev) => [data.goal, ...prev]);
      setModalVisible(false);
      setForm(FORM_VACIO);
      Toast.show({ type: 'success', text1: t('goals.successCreate') });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorCreate') });
    } finally {
      setSaving(false);
    }
  };

  const addDeposit = async () => {
    // Formato uruguayo: "3.000" usa el punto como separador de miles.
    const normalizado = depositAmount.trim().replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(normalizado);
    if (!amount || amount <= 0) return Toast.show({ type: 'error', text1: t('goals.errorAmount') });

    setSaving(true);
    try {
      const { data } = await api.post(`/goals/${depositModal}/deposits`, { amount });
      setGoals((prev) => prev.map((g) => (g.id === depositModal ? data.goal : g)));
      setDepositModal(null);
      setDepositAmount('');
      Toast.show({
        type: 'success',
        text1: data.completed
          ? t('goals.successGoalReached')
          : `Ahorraste ${formatMoney(amount, metaDeposito?.currency)}`,
      });
    } catch (_) {
      Toast.show({ type: 'error', text1: t('goals.errorUpdate') });
    } finally {
      setSaving(false);
    }
  };

  // Acreditar un movimiento del banco a una meta. El backend rechaza acreditarlo
  // dos veces (409) y rechaza un ingreso (400), asi que un doble tap no puede
  // inflar la meta.
  const acreditar = async (meta) => {
    const mov = linkModal;
    setSaving(true);
    try {
      const { data } = await api.post('/goals/link-transaction', {
        transaction_id: mov.id,
        goal_id: meta.id,
      });
      setGoals((prev) => prev.map((g) => (g.id === meta.id ? data.goal : g)));
      setCandidatos((prev) => prev.filter((c) => c.id !== mov.id));
      // Queda en pantalla con su "Deshacer" en vez de desaparecer.
      setAcreditados((prev) => [{ ...mov, metaId: meta.id, metaNombre: meta.name }, ...prev]);
      setLinkModal(null);
      Toast.show({
        type: 'success',
        text1: data.completed ? '¡Meta completada!' : `Acreditado a ${meta.name}`,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || 'No se pudo acreditar' });
    } finally {
      setSaving(false);
    }
  };

  const deshacer = async (a) => {
    try {
      const { data } = await api.delete(`/goals/link-transaction/${a.id}`);
      setGoals((prev) => prev.map((g) => (g.id === a.metaId ? data.goal : g)));
      setAcreditados((prev) => prev.filter((x) => x.id !== a.id));
      setCandidatos((prev) => [a, ...prev]);   // vuelve a la lista de sugerencias
      Toast.show({ type: 'success', text1: 'Listo, lo saqué de la meta' });
    } catch (_) {
      Toast.show({ type: 'error', text1: 'No se pudo deshacer' });
    }
  };

  const deleteGoal = (id, name) => {
    Alert.alert(t('goals.deleteTitle'), t('goals.deleteConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await api.delete(`/goals/${id}`);
          setGoals((prev) => prev.filter((g) => g.id !== id));
        },
      },
    ]);
  };

  const activas = goals.filter((g) => !g.is_completed);
  const completadas = goals.filter((g) => g.is_completed);
  const totalSaved = goals.reduce((s, g) => s + parseFloat(g.current_amount), 0);
  const totalTarget = goals.reduce((s, g) => s + parseFloat(g.target_amount), 0);
  const overall = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const metaDeposito = goals.find((g) => g.id === depositModal) || null;
  const bloqueado = !isPremium && goals.length >= 1;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Glow />
      <RefreshBadge refreshing={refreshing} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchGoals(); }}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      >
        <ScreenHeader
          title={t('goals.heroTitle')}
          subtitle={t('goals.heroSubtitle')}
          actionIcon={bloqueado ? 'lock-closed' : 'add'}
          onActionPress={() => (bloqueado ? showUpgrade('goals') : setModalVisible(true))}
        />

        {goals.length > 0 ? (
          <Card variant="raised" style={styles.bloque}>
            <View style={styles.resumen}>
              <ProgressRing value={overall} size="lg" color={COLORS.accent} label="ahorrado" />
              <View style={styles.resumenInfo}>
                <Txt variant="overline" color={COLORS.textLow}>{t('goals.totalSaved')}</Txt>
                <Txt style={styles.resumenTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatUYU(totalSaved)}
                </Txt>
                <View style={styles.resumenMetas}>
                  <View style={styles.resumenMeta}>
                    <Txt variant="caption" color={COLORS.textLow}>{t('goals.target')}</Txt>
                    <Txt style={styles.resumenValor}>{formatUYU(totalTarget)}</Txt>
                  </View>
                  <View style={styles.resumenMeta}>
                    <Txt variant="caption" color={COLORS.textLow}>{t('goals.done')}</Txt>
                    {/* El cero no va en verde: pintar "0 logradas" del color
                        del logro dice lo contrario de lo que pasa. */}
                    <Txt style={[styles.resumenValor, completadas.length > 0 && { color: COLORS.income }]}>
                      {completadas.length}
                    </Txt>
                  </View>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        <FeasibilityCard feas={feasibility} metas={activas.length} />

        <CandidatesCard
          candidatos={candidatos}
          acreditados={acreditados}
          onElegir={setLinkModal}
          onDeshacer={deshacer}
        />

        <CostCard costos={costos} />

        {activas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('goals.inProgress')}
            </Txt>
            {activas.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                feas={feasibility?.porMeta?.find((m) => m.id === goal.id) || null}
                onDeposit={() => setDepositModal(goal.id)}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </>
        ) : null}

        {completadas.length > 0 ? (
          <>
            <Txt variant="overline" color={COLORS.textLow} style={styles.seccion}>
              {t('goals.completed')}
            </Txt>
            {completadas.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDeposit={() => {}}
                onDelete={() => deleteGoal(goal.id, goal.name)}
              />
            ))}
          </>
        ) : null}

        {goals.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title={t('goals.addNew')}
            text={t('goals.addNewHint')}
            actionLabel={t('goals.addNew')}
            actionIcon="add"
            onAction={() => setModalVisible(true)}
            style={styles.bloque}
          />
        ) : bloqueado ? (
          <Card variant="locked" label="Premium" style={styles.bloque}>
            <Txt variant="h2" style={{ marginBottom: 6 }}>{t('goals.addNew')}</Txt>
            <Txt variant="body" color={COLORS.textMid} style={{ marginBottom: SPACING.m }}>
              {t('premium.upgradeNudgeGoals')}
            </Txt>
            <Button
              label={t('premium.ctaBtn')}
              variant="premiumLocked"
              icon="diamond-outline"
              onPress={() => showUpgrade('goals')}
            />
          </Card>
        ) : (
          <Button
            label={t('goals.addNew')}
            variant="secondary"
            icon="add"
            fullWidth
            onPress={() => setModalVisible(true)}
            style={styles.bloque}
          />
        )}

        {/* Aire para la tab bar flotante. */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Nueva meta */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setForm(FORM_VACIO); }}
        title={t('goals.addNew')}
        subtitle={t('goals.addNewHint')}
        primaryLabel={t('common.save')}
        onPrimary={createGoal}
        primaryLoading={saving}
      >
        <Txt variant="overline" color={COLORS.textLow} style={{ marginBottom: SPACING.s }}>
          Icono
        </Txt>
        <View style={styles.iconos}>
          {GOAL_ICONS.map((icon) => (
            <Pressable
              key={icon}
              onPress={() => setForm((f) => ({ ...f, icon }))}
              style={[styles.iconoBtn, form.icon === icon && styles.iconoBtnActivo]}
            >
              <Ionicons
                name={icon}
                size={20}
                color={form.icon === icon ? COLORS.textHigh : COLORS.textMid}
              />
            </Pressable>
          ))}
        </View>

        <Input
          icon="flag-outline"
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder={t('goals.namePlaceholder')}
          style={{ marginTop: SPACING.m, marginBottom: SPACING.s }}
        />
        {/* La moneda va ANTES del objetivo: se elige al empezar a escribir el
            numero, no despues de haberlo pensado en otra. */}
        <Segmented
          options={[
            { value: 'UYU', label: '$ Pesos' },
            { value: 'USD', label: 'US$ Dólares' },
          ]}
          value={form.currency}
          onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          money
          value={form.target_amount}
          onChangeText={(v) => setForm((f) => ({ ...f, target_amount: v }))}
          placeholder={t('goals.targetPlaceholder')}
          keyboardType="numeric"
          style={{ marginBottom: SPACING.s }}
        />
        <Input
          icon="calendar-outline"
          value={form.target_date}
          onChangeText={(v) => setForm((f) => ({ ...f, target_date: v }))}
          placeholder={t('goals.datePlaceholder')}
        />
      </BottomSheet>

      {/* Depósito */}
      {/* Un deposito va SIEMPRE en la moneda de la meta, y hay que decirlo: en
          una meta en dolares, escribir "500" sin saber si son dolares o pesos
          es una diferencia de cuarenta veces. */}
      <BottomSheet
        visible={!!depositModal}
        onClose={() => { setDepositModal(null); setDepositAmount(''); }}
        title={metaDeposito?.currency === 'USD' ? 'Ahorrar en dólares' : 'Ahorrar'}
        subtitle={metaDeposito
          ? `Se suma a ${formatMoney(parseFloat(metaDeposito.current_amount), metaDeposito.currency)} de ${metaDeposito.name}`
          : 'Se suma a lo que ya llevás en esta meta'}
        primaryLabel={t('common.save')}
        onPrimary={addDeposit}
        primaryLoading={saving}
      >
        <Input
          money
          value={depositAmount}
          onChangeText={setDepositAmount}
          placeholder={t('goals.depositPlaceholder')}
          keyboardType="numeric"
          autoFocus
        />
      </BottomSheet>

      {/* Elegir a que meta va el movimiento. No hay boton primario: la accion
          ES elegir la meta, y un "confirmar" de mas solo agrega un paso. */}
      <BottomSheet
        visible={!!linkModal}
        onClose={() => setLinkModal(null)}
        title="¿A qué meta va?"
        subtitle={linkModal ? `${formatMoney(linkModal.amount, linkModal.currency)} · ${linkModal.description}` : ''}
      >
        {activas.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => !saving && acreditar(g)}
            style={styles.cand}
          >
            <View style={styles.candInfo}>
              <Txt variant="body" color={COLORS.textHigh} numberOfLines={1}>{g.name}</Txt>
              <Txt variant="caption" color={COLORS.textLow}>
                {formatMoney(parseFloat(g.current_amount), g.currency)} de {formatMoney(parseFloat(g.target_amount), g.currency)}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLow} />
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

// Se declara con `estilos()` y no con `StyleSheet.create` suelto: create COPIA
// los colores al cargar el modulo, asi que un cambio de tema en caliente no
// repintaria nada. Ver theme.js.
const styles = estilos(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  content: { paddingHorizontal: SPACING.m, paddingTop: 60 },
  bloque: { marginTop: SPACING.m },
  seccion: { marginTop: SPACING.l, marginBottom: SPACING.s },

  resumen: { flexDirection: 'row', alignItems: 'center' },
  resumenInfo: { flex: 1, minWidth: 0, marginLeft: SPACING.m },
  resumenTotal: { fontFamily: FONTS.amountBold, fontSize: 26, lineHeight: 32, color: COLORS.textHigh, marginVertical: 2 },
  resumenMetas: { flexDirection: 'row', gap: SPACING.l, marginTop: SPACING.xs },
  resumenMeta: {},
  resumenValor: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 18, color: COLORS.textHigh, marginTop: 2 },

  feasTitular: { fontFamily: FONTS.amountBold, fontSize: 20, lineHeight: 26, color: COLORS.textHigh },
  feasPie: { flexDirection: 'row', marginTop: SPACING.s },

  cand: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.s, gap: SPACING.s },
  candInfo: { flex: 1, minWidth: 0 },
  candMonto: { fontFamily: FONTS.amountBold, fontSize: 14, lineHeight: 18, color: COLORS.textHigh },

  costoFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: SPACING.s },
  costoPunto: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  costoDot: { width: 8, height: 8, borderRadius: 4 },
  costoMonto: { fontFamily: FONTS.amount, fontSize: 13, lineHeight: 17, color: COLORS.textHigh },
  costoMeses: { width: 66, textAlign: 'right' },

  goal: { marginTop: SPACING.s },
  goalTop: { flexDirection: 'row', alignItems: 'center' },
  goalInfo: { flex: 1, minWidth: 0, marginLeft: SPACING.m },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalName: { flexShrink: 1, fontSize: 16 },
  goalAmounts: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  goalCurrent: { fontFamily: FONTS.amountBold, fontSize: 18, lineHeight: 22 },
  goalSep: { fontSize: 12 },
  goalTarget: { fontFamily: FONTS.amount, fontSize: 14, lineHeight: 18, color: COLORS.textMid },

  goalBottom: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },
  proj: { fontFamily: FONTS.semibold },
  completada: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.s },

  iconos: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.s },
  iconoBtn: {
    width: 46, height: 46, borderRadius: RADIUS.m,
    backgroundColor: COLORS.surfaceSunken,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconoBtnActivo: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
}));
