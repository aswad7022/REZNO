import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { commerceApi, type ProductSearch, type StoreSearch } from "../api/commerce";
import { MobileApiRequestError } from "../api/client";
import {
  COMMERCE_ICONS,
  CommerceButton,
  CommerceHeader,
  CommerceState,
  IconButton,
  ProductCard,
  StoreCard,
} from "../components/commerce-ui";
import { PremiumPressable } from "../components/premium-motion";
import {
  beginKeyedMutation,
  canApplyCheckoutCompletion,
  canApplyResourceSnapshot,
  canRenderCustomerCancellation,
  checkoutDraftForCart,
  collectAllCursorPages,
  finishKeyedMutation,
  hasBackDestination,
  isConfirmedEmptyResource,
  isLatestRequest,
  optimisticSet,
  resolvedSetMembership,
  resolveCheckoutAttempt,
  resolveOrderCancellationAttempt,
  rollbackOptimisticSet,
  type CheckoutDraft,
  type ResourceLoadState,
} from "../commerce/state";
import {
  commerceCopy,
  commercePaymentMethodLabel,
  commerceStatusLabel,
  formatCommerceDate,
  formatCommerceMoney,
  type CommerceCopy,
} from "../i18n/commerce";
import type { MobileLocale } from "../i18n/labels";
import type {
  CommerceAddress,
  CommerceAddressInput,
  CommerceCart,
  CommerceCollection,
  CommerceOrderDetail,
  CommerceOrderSummary,
  CommerceProduct,
  CommerceProductDetail,
  CommerceReceipt,
  CommerceStore,
  CommerceVariant,
  FavoriteProduct,
  FavoriteStore,
} from "../types/commerce";
import type { MobileTheme } from "../theme/tokens";

type EntryPoint = "favorites" | "market" | "orders";
type CatalogMode = "products" | "stores";
type Route =
  | { kind: "market" }
  | { kind: "store"; store: CommerceStore }
  | { kind: "product"; product: CommerceProductDetail }
  | { kind: "cart" }
  | { kind: "checkout" }
  | { kind: "receipt"; receipt: CommerceReceipt }
  | { kind: "orders" }
  | { kind: "order"; order: CommerceOrderDetail }
  | { kind: "favorites" }
  | { kind: "addresses"; returnToCheckout: boolean };

type LoadState = ResourceLoadState;
type PendingReplacement = { incomingStore?: string; quantity: number; variantId: string } | null;

type FavoriteResources = {
  loadProducts: (cursor?: string) => Promise<CommerceCollection<FavoriteProduct> | null>;
  loadStores: (cursor?: string) => Promise<CommerceCollection<FavoriteStore> | null>;
  productState: LoadState;
  storeState: LoadState;
};

const FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

const EMPTY_ADDRESS: CommerceAddressInput = {
  additionalDetails: "",
  area: "",
  city: "",
  landmark: null,
  phone: "",
  recipientName: "",
  street: "",
};

export function CommerceMarketScreen({
  entryPoint,
  initialOrderId,
  isRtl,
  locale,
  onOpenAccount,
  onExit,
  theme,
}: {
  entryPoint: EntryPoint;
  initialOrderId?: string;
  isRtl: boolean;
  locale: MobileLocale;
  onOpenAccount: () => void;
  onExit?: () => void;
  theme: MobileTheme;
}) {
  const copy = commerceCopy[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initialRoute = useMemo<Route>(
    () => entryPoint === "orders" ? { kind: "orders" } : entryPoint === "favorites" ? { kind: "favorites" } : { kind: "market" },
    [entryPoint],
  );
  const [route, setRoute] = useState<Route>(initialRoute);
  const [history, setHistory] = useState<Route[]>([]);
  const [cart, setCartSnapshot] = useState<CommerceCart | null>(null);
  const [cartLoadState, setCartLoadState] = useState<LoadState>("loading");
  const [sessionAvailable, setSessionAvailable] = useState<boolean | null>(null);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<Set<string>>(new Set());
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<string>>(new Set());
  const [favoriteStoreLoadState, setFavoriteStoreLoadState] = useState<LoadState>("loading");
  const [favoriteProductLoadState, setFavoriteProductLoadState] = useState<LoadState>("loading");
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement>(null);
  const cartRequestSequenceRef = useRef(0);
  const favoriteStoreIdsRef = useRef<Set<string>>(new Set());
  const favoriteProductIdsRef = useRef<Set<string>>(new Set());
  const favoriteStoreLoadSequenceRef = useRef(0);
  const favoriteProductLoadSequenceRef = useRef(0);
  const favoriteStoreRevisionRef = useRef(0);
  const favoriteProductRevisionRef = useRef(0);
  const favoriteStoreMutationTokensRef = useRef(new Map<string, number>());
  const favoriteProductMutationTokensRef = useRef(new Map<string, number>());
  const favoriteMutationSequenceRef = useRef(0);

  const updateFavoriteStoreIds = useCallback((updater: (current: ReadonlySet<string>) => Set<string>) => {
    const next = updater(favoriteStoreIdsRef.current);
    favoriteStoreIdsRef.current = next;
    setFavoriteStoreIds(next);
  }, []);

  const updateFavoriteProductIds = useCallback((updater: (current: ReadonlySet<string>) => Set<string>) => {
    const next = updater(favoriteProductIdsRef.current);
    favoriteProductIdsRef.current = next;
    setFavoriteProductIds(next);
  }, []);

  const clearPrivateSnapshots = useCallback(() => {
    cartRequestSequenceRef.current += 1;
    favoriteStoreLoadSequenceRef.current += 1;
    favoriteProductLoadSequenceRef.current += 1;
    favoriteStoreRevisionRef.current += 1;
    favoriteProductRevisionRef.current += 1;
    favoriteStoreMutationTokensRef.current.clear();
    favoriteProductMutationTokensRef.current.clear();
    setCartSnapshot(null);
    updateFavoriteStoreIds(() => new Set());
    updateFavoriteProductIds(() => new Set());
    setCheckoutDraft(null);
    setCheckoutSubmitting(false);
    setPendingReplacement(null);
    setCartLoadState("error");
    setFavoriteStoreLoadState("error");
    setFavoriteProductLoadState("error");
  }, [updateFavoriteProductIds, updateFavoriteStoreIds]);

  const beginCartRequest = useCallback(() => {
    cartRequestSequenceRef.current += 1;
    return cartRequestSequenceRef.current;
  }, []);

  const isLatestCartRequest = useCallback((sequence: number) => (
    isLatestRequest(sequence, cartRequestSequenceRef.current)
  ), []);

  const setCart = useCallback((nextCart: CommerceCart | null, requestSequence?: number) => {
    if (requestSequence !== undefined && !isLatestRequest(requestSequence, cartRequestSequenceRef.current)) return false;
    setCartSnapshot(nextCart);
    setCartLoadState("ready");
    setSessionAvailable((current) => current === false ? false : true);
    return true;
  }, []);

  const navigate = useCallback((next: Route) => {
    setHistory((current) => [...current, route]);
    setRoute(next);
    setNotice(null);
  }, [route]);

  const goBack = useCallback(() => {
    if (route.kind === "checkout" && checkoutSubmitting) return;
    if (history.length === 0) {
      onExit?.();
      return;
    }
    setHistory((current) => {
      const previous = current.at(-1);
      if (previous) setRoute(previous);
      return previous ? current.slice(0, -1) : current;
    });
    setNotice(null);
  }, [checkoutSubmitting, history.length, onExit, route.kind]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (history.length === 0 && !onExit) return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, history.length, onExit]);

  const handlePrivateError = useCallback((error: unknown) => {
    if (error instanceof MobileApiRequestError && error.status === 401) {
      clearPrivateSnapshots();
      setSessionAvailable(false);
      setNotice(copy.sessionRequired);
      return true;
    }
    setNotice(messageForError(error, copy));
    return false;
  }, [clearPrivateSnapshots, copy]);

  const refreshCart = useCallback(async () => {
    const sequence = beginCartRequest();
    setCartLoadState("loading");
    try {
      setCart(await commerceApi.getCart(), sequence);
    } catch (error) {
      if (isUnauthorizedError(error)) handlePrivateError(error);
      else if (isLatestCartRequest(sequence)) {
        setCartLoadState("error");
        handlePrivateError(error);
      }
    }
  }, [beginCartRequest, handlePrivateError, isLatestCartRequest, setCart]);

  const loadFavoriteStores = useCallback(async (cursor?: string) => {
    const sequence = ++favoriteStoreLoadSequenceRef.current;
    const startedRevision = favoriteStoreRevisionRef.current;
    setFavoriteStoreLoadState("loading");
    try {
      const result = await collectAllCursorPages(commerceApi.listFavoriteStores, cursor);
      if (!canApplyResourceSnapshot(sequence, favoriteStoreLoadSequenceRef.current, startedRevision, favoriteStoreRevisionRef.current)) return null;
      const ids = result.data.map((item) => item.store.id);
      updateFavoriteStoreIds((current) => cursor ? new Set([...current, ...ids]) : new Set(ids));
      setFavoriteStoreLoadState("ready");
      setSessionAvailable((current) => current === false ? false : true);
      return result;
    } catch (error) {
      if (isUnauthorizedError(error)) handlePrivateError(error);
      else if (canApplyResourceSnapshot(sequence, favoriteStoreLoadSequenceRef.current, startedRevision, favoriteStoreRevisionRef.current)) {
        setFavoriteStoreLoadState("error");
        handlePrivateError(error);
      }
      return null;
    }
  }, [handlePrivateError, updateFavoriteStoreIds]);

  const loadFavoriteProducts = useCallback(async (cursor?: string) => {
    const sequence = ++favoriteProductLoadSequenceRef.current;
    const startedRevision = favoriteProductRevisionRef.current;
    setFavoriteProductLoadState("loading");
    try {
      const result = await collectAllCursorPages(commerceApi.listFavoriteProducts, cursor);
      if (!canApplyResourceSnapshot(sequence, favoriteProductLoadSequenceRef.current, startedRevision, favoriteProductRevisionRef.current)) return null;
      const ids = result.data.map((item) => item.product.id);
      updateFavoriteProductIds((current) => cursor ? new Set([...current, ...ids]) : new Set(ids));
      setFavoriteProductLoadState("ready");
      setSessionAvailable((current) => current === false ? false : true);
      return result;
    } catch (error) {
      if (isUnauthorizedError(error)) handlePrivateError(error);
      else if (canApplyResourceSnapshot(sequence, favoriteProductLoadSequenceRef.current, startedRevision, favoriteProductRevisionRef.current)) {
        setFavoriteProductLoadState("error");
        handlePrivateError(error);
      }
      return null;
    }
  }, [handlePrivateError, updateFavoriteProductIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshCart();
      if (entryPoint !== "favorites") {
        void loadFavoriteStores();
        void loadFavoriteProducts();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [entryPoint, loadFavoriteProducts, loadFavoriteStores, refreshCart]);

  useEffect(() => {
    if (!initialOrderId) return;
    let active = true;
    const timer = setTimeout(() => {
      setNotice(copy.loading);
      void commerceApi.getOrder(initialOrderId)
        .then((order) => {
          if (!active) return;
          setHistory([]);
          setRoute({ kind: "order", order });
          setNotice(null);
        })
        .catch((error) => {
          if (!active) return;
          setRoute({ kind: "orders" });
          handlePrivateError(error);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [copy.loading, handlePrivateError, initialOrderId]);

  const openStore = async (storeSlug: string) => {
    setNotice(copy.loading);
    try {
      navigate({ kind: "store", store: await commerceApi.getStore(storeSlug) });
    } catch (error) {
      setNotice(messageForError(error, copy));
    }
  };

  const openProduct = async (storeSlug: string, productSlug: string) => {
    setNotice(copy.loading);
    try {
      navigate({ kind: "product", product: await commerceApi.getProduct(storeSlug, productSlug) });
    } catch (error) {
      setNotice(messageForError(error, copy));
    }
  };

  const toggleStoreFavorite = async (store: CommerceStore) => {
    if (sessionAvailable === false) {
      handlePrivateError(new MobileApiRequestError("", 401));
      return false;
    }
    const token = ++favoriteMutationSequenceRef.current;
    if (!beginKeyedMutation(favoriteStoreMutationTokensRef.current, store.id, token)) return false;
    const wasFavorite = favoriteStoreIdsRef.current.has(store.id);
    favoriteStoreRevisionRef.current += 1;
    updateFavoriteStoreIds((current) => optimisticSet(current, store.id, !wasFavorite));
    try {
      if (wasFavorite) await commerceApi.removeFavoriteStore(store.id);
      else await commerceApi.addFavoriteStore(store.id);
      const latest = finishKeyedMutation(favoriteStoreMutationTokensRef.current, store.id, token);
      if (latest) {
        favoriteStoreRevisionRef.current += 1;
        setSessionAvailable((current) => current === false ? false : true);
        void loadFavoriteStores();
      }
      return latest;
    } catch (error) {
      const latest = finishKeyedMutation(favoriteStoreMutationTokensRef.current, store.id, token);
      if (latest) {
        favoriteStoreRevisionRef.current += 1;
        updateFavoriteStoreIds((current) => rollbackOptimisticSet(current, store.id, !wasFavorite, wasFavorite));
      }
      if (isUnauthorizedError(error) || latest) handlePrivateError(error);
      if (latest && !isUnauthorizedError(error)) void loadFavoriteStores();
      return false;
    }
  };

  const toggleProductFavorite = async (product: CommerceProduct) => {
    if (sessionAvailable === false) {
      handlePrivateError(new MobileApiRequestError("", 401));
      return false;
    }
    const token = ++favoriteMutationSequenceRef.current;
    if (!beginKeyedMutation(favoriteProductMutationTokensRef.current, product.id, token)) return false;
    const wasFavorite = favoriteProductIdsRef.current.has(product.id);
    favoriteProductRevisionRef.current += 1;
    updateFavoriteProductIds((current) => optimisticSet(current, product.id, !wasFavorite));
    try {
      if (wasFavorite) await commerceApi.removeFavoriteProduct(product.id);
      else await commerceApi.addFavoriteProduct(product.id);
      const latest = finishKeyedMutation(favoriteProductMutationTokensRef.current, product.id, token);
      if (latest) {
        favoriteProductRevisionRef.current += 1;
        setSessionAvailable((current) => current === false ? false : true);
        void loadFavoriteProducts();
      }
      return latest;
    } catch (error) {
      const latest = finishKeyedMutation(favoriteProductMutationTokensRef.current, product.id, token);
      if (latest) {
        favoriteProductRevisionRef.current += 1;
        updateFavoriteProductIds((current) => rollbackOptimisticSet(current, product.id, !wasFavorite, wasFavorite));
      }
      if (isUnauthorizedError(error) || latest) handlePrivateError(error);
      if (latest && !isUnauthorizedError(error)) void loadFavoriteProducts();
      return false;
    }
  };

  const addToCart = async (variant: CommerceVariant, quantity: number, incomingStore?: string) => {
    const sequence = beginCartRequest();
    setNotice(null);
    try {
      const next = await commerceApi.addCartItem(variant.id, quantity, cart?.version);
      if (!setCart(next, sequence)) return;
      navigate({ kind: "cart" });
    } catch (error) {
      if (!isLatestCartRequest(sequence) && !isUnauthorizedError(error)) return;
      if (isCartStoreConflict(error) && cart) {
        setPendingReplacement({ incomingStore, quantity, variantId: variant.id });
        return;
      }
      if (isCartVersionConflict(error)) await refreshCart();
      handlePrivateError(error);
    }
  };

  const replaceCart = async () => {
    if (!pendingReplacement || !cart) return;
    const sequence = beginCartRequest();
    try {
      const next = await commerceApi.replaceCart(
        cart.id, cart.version, pendingReplacement.variantId, pendingReplacement.quantity,
      );
      if (!setCart(next, sequence)) return;
      setPendingReplacement(null);
      navigate({ kind: "cart" });
    } catch (error) {
      if (!isLatestCartRequest(sequence) && !isUnauthorizedError(error)) return;
      setPendingReplacement(null);
      if (isCartVersionConflict(error)) await refreshCart();
      handlePrivateError(error);
    }
  };

  const canGoBack = hasBackDestination(history.length, Boolean(onExit));
  const favoriteResources = useMemo<FavoriteResources>(() => ({
    loadProducts: loadFavoriteProducts,
    loadStores: loadFavoriteStores,
    productState: favoriteProductLoadState,
    storeState: favoriteStoreLoadState,
  }), [favoriteProductLoadState, favoriteStoreLoadState, loadFavoriteProducts, loadFavoriteStores]);

  const common = {
    beginCartRequest,
    canGoBack,
    cart,
    cartLoadState,
    checkoutDraft,
    checkoutSubmitting,
    copy,
    favoriteProductIds,
    favoriteResources,
    favoriteStoreIds,
    goBack,
    handlePrivateError,
    isRtl,
    isLatestCartRequest,
    locale,
    navigate,
    notice,
    onOpenAccount,
    openProduct,
    openStore,
    refreshCart,
    sessionAvailable,
    setCart,
    setCheckoutDraft,
    setCheckoutSubmitting,
    setNotice,
    theme,
    toggleProductFavorite,
    toggleStoreFavorite,
  };

  return (
    <View style={styles.screen}>
      {route.kind === "market" ? <MarketHome {...common} /> : null}
      {route.kind === "store" ? <StoreDetail {...common} store={route.store} /> : null}
      {route.kind === "product" ? (
        <ProductDetail {...common} addToCart={addToCart} product={route.product} />
      ) : null}
      {route.kind === "cart" ? <CartScreen {...common} /> : null}
      {route.kind === "checkout" ? <CheckoutScreen {...common} /> : null}
      {route.kind === "receipt" ? <ReceiptScreen {...common} receipt={route.receipt} /> : null}
      {route.kind === "orders" ? <OrdersScreen {...common} /> : null}
      {route.kind === "order" ? <OrderDetail {...common} order={route.order} /> : null}
      {route.kind === "favorites" ? <FavoritesScreen {...common} /> : null}
      {route.kind === "addresses" ? <AddressesScreen {...common} returnToCheckout={route.returnToCheckout} /> : null}

      {notice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <Modal animationType="fade" onRequestClose={() => setPendingReplacement(null)} transparent visible={Boolean(pendingReplacement)}>
        <View style={styles.modalRoot}>
          <Pressable onPress={() => setPendingReplacement(null)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text style={[styles.dialogTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.replaceCart}</Text>
            <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{copy.replaceCartBody}</Text>
            {cart?.store.name ? <Text style={styles.muted}>{cart.store.name}</Text> : null}
            {pendingReplacement?.incomingStore ? <Text style={styles.muted}>{pendingReplacement.incomingStore}</Text> : null}
            <CommerceButton label={copy.replaceCart} onPress={() => void replaceCart()} theme={theme} />
            <CommerceButton label={copy.keepCart} onPress={() => setPendingReplacement(null)} secondary theme={theme} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

type CommonProps = {
  beginCartRequest: () => number;
  canGoBack: boolean;
  cart: CommerceCart | null;
  cartLoadState: LoadState;
  checkoutDraft: CheckoutDraft | null;
  checkoutSubmitting: boolean;
  copy: CommerceCopy;
  favoriteProductIds: Set<string>;
  favoriteResources: FavoriteResources;
  favoriteStoreIds: Set<string>;
  goBack: () => void;
  handlePrivateError: (error: unknown) => boolean;
  isRtl: boolean;
  isLatestCartRequest: (sequence: number) => boolean;
  locale: MobileLocale;
  navigate: (route: Route) => void;
  notice: string | null;
  onOpenAccount: () => void;
  openProduct: (storeSlug: string, productSlug: string) => Promise<void>;
  openStore: (storeSlug: string) => Promise<void>;
  refreshCart: () => Promise<void>;
  sessionAvailable: boolean | null;
  setCart: (cart: CommerceCart | null, requestSequence?: number) => boolean;
  setCheckoutDraft: Dispatch<SetStateAction<CheckoutDraft | null>>;
  setCheckoutSubmitting: Dispatch<SetStateAction<boolean>>;
  setNotice: (notice: string | null) => void;
  theme: MobileTheme;
  toggleProductFavorite: (product: CommerceProduct) => Promise<boolean>;
  toggleStoreFavorite: (store: CommerceStore) => Promise<boolean>;
};

function MarketHome(props: CommonProps) {
  const { cart, copy, favoriteProductIds, favoriteResources, favoriteStoreIds, isRtl, locale, navigate, openProduct, openStore, sessionAvailable, theme, toggleProductFavorite, toggleStoreFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<CatalogMode>("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [inStock, setInStock] = useState(false);
  const [productSort, setProductSort] = useState<ProductSearch["sort"]>("newest");
  const [storeSort, setStoreSort] = useState<StoreSearch["sort"]>("newest");
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [stores, setStores] = useState<CommerceStore[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const requestSequence = useRef(0);
  const membershipState = mode === "products" ? favoriteResources.productState : favoriteResources.storeState;
  const retryMembership = mode === "products" ? favoriteResources.loadProducts : favoriteResources.loadStores;

  useEffect(() => {
    const controller = new AbortController();
    void commerceApi.listCategories(controller.signal).then((result) => setCategories(result.data)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const load = useCallback(async (append = false) => {
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    setState("loading");
    try {
      if (mode === "products") {
        const result = await commerceApi.listProducts({
          category, cursor: append ? cursor ?? undefined : undefined, inStock: inStock || undefined,
          limit: 12, q: query.trim() || undefined, sort: productSort,
        }, controller.signal);
        if (!isLatestRequest(sequence, requestSequence.current)) return;
        setProducts((current) => append ? [...current, ...result.data] : result.data);
        setCursor(result.pageInfo.nextCursor);
        setHasNext(result.pageInfo.hasNextPage);
      } else {
        const result = await commerceApi.listStores({
          category, cursor: append ? cursor ?? undefined : undefined, limit: 12,
          q: query.trim() || undefined, sort: storeSort,
        }, controller.signal);
        if (!isLatestRequest(sequence, requestSequence.current)) return;
        setStores((current) => append ? [...current, ...result.data] : result.data);
        setCursor(result.pageInfo.nextCursor);
        setHasNext(result.pageInfo.hasNextPage);
      }
      setState("ready");
    } catch (error) {
      if ((error as Error).name !== "AbortError" && isLatestRequest(sequence, requestSequence.current)) setState("error");
    }
    return () => controller.abort();
  }, [category, cursor, inStock, mode, productSort, query, storeSort]);

  useEffect(() => {
    const timer = setTimeout(() => void load(false), 400);
    return () => clearTimeout(timer);
    // cursor is intentionally excluded: it changes only during pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, inStock, mode, productSort, query, storeSort]);

  return (
    <View style={styles.stack}>
      <CommerceHeader cartQuantity={sessionAvailable !== false ? cart?.totalQuantity : undefined} copy={copy} isRtl={isRtl} onCart={() => navigate({ kind: "cart" })} title={copy.market} theme={theme} />
      <View accessibilityRole="search" style={[styles.search, isRtl && styles.rowRtl]}>
        <Image alt="" source={COMMERCE_ICONS.search} style={styles.searchIcon} />
        <TextInput
          accessibilityLabel={copy.search}
          onChangeText={setQuery}
          placeholder={copy.search}
          placeholderTextColor={theme.colors.mutedForeground}
          returnKeyType="search"
          style={[styles.input, isRtl ? styles.rtl : styles.ltr]}
          value={query}
        />
        {query ? <Pressable accessibilityLabel={copy.clear} accessibilityRole="button" onPress={() => setQuery("")}><Text style={styles.goldText}>{copy.clear}</Text></Pressable> : null}
      </View>
      <View style={[styles.segment, isRtl && styles.rowRtl]}>
        <Chip label={copy.products} onPress={() => setMode("products")} selected={mode === "products"} theme={theme} />
        <Chip label={copy.stores} onPress={() => setMode("stores")} selected={mode === "stores"} theme={theme} />
      </View>
      <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.categories}</Text>
      <View style={[styles.wrap, isRtl && styles.rowRtl]}>
        <Chip label={copy.all} onPress={() => setCategory(undefined)} selected={!category} theme={theme} />
        {categories.map((item) => <Chip key={item.id} label={item.name} onPress={() => setCategory(item.slug)} selected={category === item.slug} theme={theme} />)}
      </View>
      <View style={[styles.wrap, isRtl && styles.rowRtl]}>
        {mode === "products" ? <Chip label={copy.inStock} onPress={() => setInStock((value) => !value)} selected={inStock} theme={theme} /> : null}
        <Chip label={copy.newest} onPress={() => mode === "products" ? setProductSort("newest") : setStoreSort("newest")} selected={(mode === "products" ? productSort : storeSort) === "newest"} theme={theme} />
        <Chip label={copy.nameAsc} onPress={() => mode === "products" ? setProductSort("name_asc") : setStoreSort("name_asc")} selected={(mode === "products" ? productSort : storeSort) === "name_asc"} theme={theme} />
        {mode === "products" ? <Chip label={copy.priceAsc} onPress={() => setProductSort("price_asc")} selected={productSort === "price_asc"} theme={theme} /> : null}
        {mode === "products" ? <Chip label={copy.priceDesc} onPress={() => setProductSort("price_desc")} selected={productSort === "price_desc"} theme={theme} /> : null}
      </View>
      {state === "loading" && (mode === "products" ? products : stores).length === 0 ? <CommerceState title={copy.loading} theme={theme} /> : null}
      {state === "error" ? <CommerceState body={copy.errorGeneric} buttonLabel={copy.retry} onPress={() => void load(false)} theme={theme} title={copy.errorGeneric} /> : null}
      {sessionAvailable !== false && membershipState === "error" ? <CommerceState body={copy.errorGeneric} buttonLabel={copy.retry} onPress={() => void retryMembership()} theme={theme} title={copy.favorites} /> : null}
      {state === "ready" && mode === "products" && products.length === 0 ? <CommerceState body={copy.emptyBody} theme={theme} title={query ? copy.noResults : copy.emptyTitle} /> : null}
      {state === "ready" && mode === "stores" && stores.length === 0 ? <CommerceState body={copy.emptyBody} theme={theme} title={query ? copy.noResults : copy.emptyTitle} /> : null}
      {mode === "products" ? products.map((product) => (
        <ProductCard copy={copy} favorite={sessionAvailable === true ? resolvedSetMembership(favoriteProductIds, product.id, favoriteResources.productState) : undefined} isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void toggleProductFavorite(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />
      )) : stores.map((store) => (
        <StoreCard copy={copy} favorite={sessionAvailable === true ? resolvedSetMembership(favoriteStoreIds, store.id, favoriteResources.storeState) : undefined} isRtl={isRtl} key={store.id} locale={locale} onFavorite={() => void toggleStoreFavorite(store)} onPress={() => void openStore(store.slug)} store={store} theme={theme} />
      ))}
      {hasNext ? <CommerceButton disabled={state === "loading"} label={state === "loading" ? copy.loading : copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
    </View>
  );
}

function StoreDetail(props: CommonProps & { store: CommerceStore }) {
  const { cart, copy, favoriteProductIds, favoriteResources, favoriteStoreIds, goBack, isRtl, locale, navigate, openProduct, sessionAvailable, store, theme, toggleProductFavorite, toggleStoreFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const storeFavorite = sessionAvailable === true
    ? resolvedSetMembership(favoriteStoreIds, store.id, favoriteResources.storeState)
    : undefined;
  const load = async (append = false) => {
    setState("loading");
    try {
      const result = await commerceApi.listStoreProducts(store.slug, { cursor: append ? cursor ?? undefined : undefined, limit: 20 });
      setProducts((current) => append ? [...current, ...result.data] : result.data);
      setCursor(result.pageInfo.nextCursor);
      setHasNext(result.pageInfo.hasNextPage);
      setState("ready");
    } catch { setState("error"); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [store.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={styles.stack}>
    <CommerceHeader cartQuantity={sessionAvailable !== false ? cart?.totalQuantity : undefined} copy={copy} isRtl={isRtl} onBack={goBack} onCart={() => navigate({ kind: "cart" })} title={store.name} theme={theme} />
    {store.coverImageUrl ? <Image alt={store.name} source={{ uri: store.coverImageUrl }} style={styles.heroImage} /> : null}
    <View style={styles.panel}>
      <View style={[styles.between, isRtl && styles.rowRtl]}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{store.name}</Text>{storeFavorite === undefined ? null : <IconButton active={storeFavorite} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={() => void toggleStoreFavorite(store)} theme={theme} />}</View>
      {store.description ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{store.description}</Text> : null}
      <Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{copy.minimumOrder}: {formatCommerceMoney(store.minimumOrderValue, store.currency, locale)}</Text>
      {store.delivery.enabled ? <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.delivery} · {formatCommerceMoney(store.delivery.fee, store.currency, locale)}</Text> : null}
      {store.pickup.enabled && store.pickup.instructions ? <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.pickup}: {store.pickup.instructions}</Text> : null}
    </View>
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.products}</Text>
    {state === "loading" && !products.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {sessionAvailable !== false && (favoriteResources.storeState === "error" || favoriteResources.productState === "error") ? <CommerceState buttonLabel={copy.retry} onPress={() => { void favoriteResources.loadStores(); void favoriteResources.loadProducts(); }} theme={theme} title={copy.favorites} /> : null}
    {state === "ready" && !products.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {products.map((product) => <ProductCard copy={copy} favorite={sessionAvailable === true ? resolvedSetMembership(favoriteProductIds, product.id, favoriteResources.productState) : undefined} isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void toggleProductFavorite(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />)}
    {hasNext ? <CommerceButton label={copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
  </View>;
}

function ProductDetail(props: CommonProps & { addToCart: (variant: CommerceVariant, quantity: number, incomingStore?: string) => Promise<void>; product: CommerceProductDetail }) {
  const { addToCart, cart, copy, favoriteProductIds, favoriteResources, goBack, isRtl, locale, navigate, product, sessionAvailable, theme, toggleProductFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selectable = product.variants.filter((variant) => variant.inStock);
  const automatic = product.variants.length === 1 || (selectable.length === 1 && selectable[0]?.isDefault);
  const [variantId, setVariantId] = useState<string | null>(automatic ? selectable[0]?.id ?? null : null);
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? null;
  const favorite = sessionAvailable === true
    ? resolvedSetMembership(favoriteProductIds, product.id, favoriteResources.productState)
    : undefined;
  return <View style={styles.stack}>
    <CommerceHeader cartQuantity={sessionAvailable !== false ? cart?.totalQuantity : undefined} copy={copy} isRtl={isRtl} onBack={goBack} onCart={() => navigate({ kind: "cart" })} title={product.name} theme={theme} />
    {product.media[0]?.url ? <Image alt={product.media[0].altText ?? product.name} source={{ uri: product.media[0].url }} style={styles.detailImage} /> : <View style={styles.mediaFallback}><Image alt="" source={COMMERCE_ICONS.catalog} style={styles.mediaIcon} /></View>}
    <View style={styles.panel}>
      <View style={[styles.between, isRtl && styles.rowRtl]}><View style={styles.flex}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{product.name}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{product.store.name} · {product.category.name}</Text></View>{favorite === undefined ? null : <IconButton active={favorite} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={() => void toggleProductFavorite(product)} theme={theme} />}</View>
      {product.description ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{product.description}</Text> : null}
      <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.selectVariant}</Text>
      <View style={[styles.wrap, isRtl && styles.rowRtl]}>{product.variants.map((variant) => <Chip disabled={!variant.inStock} key={variant.id} label={`${variant.title} · ${formatCommerceMoney(variant.price, variant.currency, locale)}`} onPress={() => setVariantId(variant.id)} selected={variantId === variant.id} theme={theme} />)}</View>
      {selected?.compareAtPrice ? <Text style={styles.muted}>{formatCommerceMoney(selected.compareAtPrice, selected.currency, locale)}</Text> : null}
      <View style={[styles.quantityRow, isRtl && styles.rowRtl]}><Text style={styles.label}>{copy.quantity}</Text><QuantityControl copy={copy} quantity={quantity} setQuantity={setQuantity} theme={theme} /></View>
      <CommerceButton disabled={!selected?.inStock} label={selected ? copy.addToCart : copy.selectVariant} onPress={() => selected ? void addToCart(selected, quantity, product.store.name) : undefined} theme={theme} />
    </View>
    {sessionAvailable !== false && favoriteResources.productState === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void favoriteResources.loadProducts()} theme={theme} title={copy.favorites} /> : null}
  </View>;
}

function CartScreen(props: CommonProps) {
  const { beginCartRequest, cart, cartLoadState, copy, goBack, handlePrivateError, isLatestCartRequest, isRtl, locale, navigate, onOpenAccount, refreshCart, sessionAvailable, setCart, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mutate = async (operation: () => Promise<CommerceCart | null>) => {
    const sequence = beginCartRequest();
    setNotice(null);
    try { setCart(await operation(), sequence); }
    catch (error) {
      if (!isLatestCartRequest(sequence) && !isUnauthorizedError(error)) return;
      if (isCartVersionConflict(error)) await refreshCart();
      handlePrivateError(error);
    }
  };
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.cart} theme={theme} />
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {sessionAvailable !== false && cartLoadState === "loading" && !cart ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {sessionAvailable !== false && cartLoadState === "error" ? <CommerceState body={copy.errorGeneric} buttonLabel={copy.retry} onPress={() => void refreshCart()} theme={theme} title={copy.errorGeneric} /> : null}
    {sessionAvailable !== false && isConfirmedEmptyResource(cartLoadState, Boolean(cart)) ? <CommerceState body={copy.cartEmpty} buttonLabel={copy.continueShopping} onPress={() => navigate({ kind: "market" })} theme={theme} title={copy.cart} /> : null}
    {sessionAvailable !== false && cart ? <>
      <View style={styles.panel}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{cart.store.name}</Text><Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{copy.subtotal}: {formatCommerceMoney(cart.informationalSubtotal, cart.currency, locale)}</Text></View>
      {cart.items.map((item) => <View key={item.cartItemId} style={styles.lineCard}>
        <View style={[styles.lineTop, isRtl && styles.rowRtl]}>{item.primaryMediaUrl ? <Image alt={item.productName} source={{ uri: item.primaryMediaUrl }} style={styles.thumbnail} /> : null}<View style={styles.flex}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{item.productName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{item.variantTitle}</Text><Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{formatCommerceMoney(item.unitPrice, item.currency, locale)}</Text>{!item.isAvailable ? <Text style={styles.danger}>{copy.notAvailable}</Text> : null}{item.priceChanged ? <Text style={styles.warning}>{copy.subtotal}</Text> : null}</View></View>
        <View style={[styles.between, isRtl && styles.rowRtl]}><QuantityControl copy={copy} quantity={item.quantity} setQuantity={(quantity) => void mutate(() => commerceApi.updateCartItem(item.cartItemId, quantity, cart.version))} theme={theme} /><CommerceButton label={copy.remove} onPress={() => void mutate(() => commerceApi.removeCartItem(item.cartItemId, cart.version))} secondary theme={theme} /></View>
      </View>)}
      {!cart.availability ? <CommerceState body={copy.cartUnavailable} theme={theme} title={copy.notAvailable} /> : null}
      <CommerceButton disabled={!cart.availability || !cart.items.length} label={copy.checkout} onPress={() => navigate({ kind: "checkout" })} theme={theme} />
      <CommerceButton label={copy.clearCart} onPress={() => void mutate(async () => { await commerceApi.clearCart(cart.version); return null; })} secondary theme={theme} />
      <CommerceButton label={copy.continueShopping} onPress={() => navigate({ kind: "market" })} secondary theme={theme} />
    </> : null}
  </View>;
}

function CheckoutScreen(props: CommonProps) {
  const { beginCartRequest, cart, checkoutDraft, checkoutSubmitting: submitting, copy, goBack, handlePrivateError, isLatestCartRequest, isRtl, locale, navigate, onOpenAccount, sessionAvailable, setCart, setCheckoutDraft, setCheckoutSubmitting, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [addresses, setAddresses] = useState<CommerceAddress[]>([]);
  const [storeDetails, setStoreDetails] = useState<CommerceStore | null>(null);
  const mountedRef = useRef(false);
  const submissionInFlightRef = useRef(false);
  const submissionSequenceRef = useRef(0);
  const draft = cart ? checkoutDraftForCart(checkoutDraft, cart) : null;
  const checkoutCartId = cart?.id;
  const checkoutStoreId = cart?.store.id;
  const checkoutStoreSlug = cart?.store.slug;
  const latestCartIdentityRef = useRef({ id: checkoutCartId, version: cart?.version });
  const updateDraft = (patch: Partial<Pick<CheckoutDraft, "addressId" | "customerInstructions" | "fulfillmentMethod">>) => {
    if (!cart) return;
    setCheckoutDraft((current) => ({ ...checkoutDraftForCart(current, cart), ...patch, attempt: null }));
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    latestCartIdentityRef.current = { id: checkoutCartId, version: cart?.version };
  }, [cart?.version, checkoutCartId]);

  useEffect(() => {
    if (!checkoutCartId || !checkoutStoreId || !checkoutStoreSlug) return;
    let active = true;
    const cartRequestSequence = beginCartRequest();
    const requestedCart = { id: checkoutCartId, store: { id: checkoutStoreId } };
    const load = async () => {
      const [cartResult, addressesResult, storeResult] = await Promise.allSettled([
        commerceApi.getCart(),
        commerceApi.listAddresses(),
        commerceApi.getStore(checkoutStoreSlug),
      ]);
      if (!active) return;
      const unauthorized = [cartResult, addressesResult].find(
        (result) => result.status === "rejected" && isUnauthorizedError(result.reason),
      );
      if (unauthorized?.status === "rejected") {
        setAddresses([]);
        setStoreDetails(null);
        handlePrivateError(unauthorized.reason);
        return;
      }
      if (cartResult.status === "fulfilled") setCart(cartResult.value, cartRequestSequence);
      else if (isLatestCartRequest(cartRequestSequence)) handlePrivateError(cartResult.reason);
      if (addressesResult.status === "fulfilled") {
        const nextAddresses = addressesResult.value.data;
        setAddresses(nextAddresses);
        setCheckoutDraft((current) => {
          const currentDraft = checkoutDraftForCart(current, requestedCart);
          const currentAddressExists = nextAddresses.some((item) => item.id === currentDraft.addressId);
          const addressId = currentAddressExists
            ? currentDraft.addressId
            : nextAddresses.find((item) => item.isDefault)?.id ?? nextAddresses[0]?.id ?? null;
          return addressId === currentDraft.addressId ? currentDraft : { ...currentDraft, addressId };
        });
      } else handlePrivateError(addressesResult.reason);
      if (storeResult.status === "fulfilled") {
        const store = storeResult.value;
        setStoreDetails(store);
        setCheckoutDraft((current) => {
          const currentDraft = checkoutDraftForCart(current, requestedCart);
          let fulfillmentMethod = currentDraft.fulfillmentMethod;
          if (fulfillmentMethod === "CUSTOMER_PICKUP" && !store.pickup.enabled && store.delivery.enabled) {
            fulfillmentMethod = "STORE_DELIVERY";
          } else if (fulfillmentMethod === "STORE_DELIVERY" && !store.delivery.enabled && store.pickup.enabled) {
            fulfillmentMethod = "CUSTOMER_PICKUP";
          }
          return fulfillmentMethod === currentDraft.fulfillmentMethod
            ? currentDraft
            : { ...currentDraft, fulfillmentMethod };
        });
      } else setNotice(messageForError(storeResult.reason, copy));
    };
    void load();
    return () => { active = false; };
  }, [beginCartRequest, checkoutCartId, checkoutStoreId, checkoutStoreSlug, copy, handlePrivateError, isLatestCartRequest, setCart, setCheckoutDraft, setNotice]);

  if (sessionAvailable === false) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} title={copy.checkout} theme={theme} /><CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /></View>;
  if (!cart) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.checkout} theme={theme} /><CommerceState body={copy.cartEmpty} theme={theme} title={copy.cartEmpty} /></View>;
  const addressId = draft?.addressId ?? null;
  const fulfillment = draft?.fulfillmentMethod ?? "CUSTOMER_PICKUP";
  const instructions = draft?.customerInstructions ?? "";
  const checkoutInput = { addressId: fulfillment === "STORE_DELIVERY" ? addressId : null, cartId: cart.id, cartVersion: cart.version, customerInstructions: instructions.trim() || null, fulfillmentMethod: fulfillment };
  const submit = async () => {
    if (fulfillment === "STORE_DELIVERY" && !addressId) return setNotice(copy.addressRequired);
    if (submissionInFlightRef.current) return;
    submissionInFlightRef.current = true;
    const submissionSequence = ++submissionSequenceRef.current;
    const cartRequestSequence = beginCartRequest();
    const submittedCart = { id: cart.id, version: cart.version };
    setCheckoutSubmitting(true); setNotice(null);
    const attempt = resolveCheckoutAttempt(draft?.attempt ?? null, checkoutInput, createUuid);
    setCheckoutDraft((current) => ({ ...checkoutDraftForCart(current, cart), attempt }));
    try {
      const receipt = await commerceApi.checkout(checkoutInput, attempt.key);
      const latestCart = latestCartIdentityRef.current;
      if (!canApplyCheckoutCompletion({
        cartRequestIsLatest: isLatestCartRequest(cartRequestSequence),
        currentCart: latestCart,
        latestSubmissionSequence: submissionSequenceRef.current,
        mounted: mountedRef.current,
        submissionSequence,
        submittedCart,
      })) return;
      if (!setCart(null, cartRequestSequence)) return;
      setCheckoutDraft(null);
      setCheckoutSubmitting(false);
      navigate({ kind: "receipt", receipt });
    } catch (error) {
      if (mountedRef.current && submissionSequence === submissionSequenceRef.current) handlePrivateError(error);
    } finally {
      if (submissionSequence === submissionSequenceRef.current) {
        submissionInFlightRef.current = false;
        if (mountedRef.current) setCheckoutSubmitting(false);
      }
    }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={submitting ? undefined : goBack} title={copy.checkout} theme={theme} />
    <View style={styles.panel}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{cart.store.name}</Text><Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{copy.subtotal}: {formatCommerceMoney(cart.informationalSubtotal, cart.currency, locale)}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.checkoutHint}</Text></View>
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.fulfillment}</Text>
    <View style={[styles.segment, isRtl && styles.rowRtl]}><Chip disabled={submitting || (storeDetails ? !storeDetails.pickup.enabled : false)} label={copy.pickup} onPress={() => updateDraft({ fulfillmentMethod: "CUSTOMER_PICKUP" })} selected={fulfillment === "CUSTOMER_PICKUP"} theme={theme} /><Chip disabled={submitting || (storeDetails ? !storeDetails.delivery.enabled : false)} label={copy.delivery} onPress={() => updateDraft({ fulfillmentMethod: "STORE_DELIVERY" })} selected={fulfillment === "STORE_DELIVERY"} theme={theme} /></View>
    {fulfillment === "STORE_DELIVERY" ? <><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.selectAddress}</Text>{addresses.map((address) => <PremiumPressable accessibilityRole="radio" accessibilityState={{ checked: address.id === addressId, disabled: submitting }} disabled={submitting} key={address.id} onPress={() => updateDraft({ addressId: address.id })} style={[styles.addressChoice, address.id === addressId && styles.selected]}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{address.recipientName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{address.city} · {address.area} · {address.street}</Text></PremiumPressable>)}<CommerceButton disabled={submitting} label={copy.addAddress} onPress={() => navigate({ kind: "addresses", returnToCheckout: true })} secondary theme={theme} /></> : null}
    <TextInput accessibilityLabel={copy.customerInstructions} editable={!submitting} multiline maxLength={1000} onChangeText={(value) => updateDraft({ customerInstructions: value })} placeholder={copy.customerInstructions} placeholderTextColor={theme.colors.mutedForeground} style={[styles.textArea, isRtl ? styles.rtl : styles.ltr]} value={instructions} />
    <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.payment}: {fulfillment === "STORE_DELIVERY" ? copy.cashOnDelivery : copy.payAtPickup}</Text>
    <CommerceButton disabled={submitting || !cart.availability || (fulfillment === "STORE_DELIVERY" && !addressId)} label={submitting ? copy.loading : copy.confirm} onPress={() => void submit()} theme={theme} />
  </KeyboardAvoidingView>;
}

function ReceiptScreen(props: CommonProps & { receipt: CommerceReceipt }) {
  const { copy, handlePrivateError, isRtl, locale, navigate, onOpenAccount, receipt, sessionAvailable, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const openOrder = async () => {
    try { navigate({ kind: "order", order: await commerceApi.getOrder(receipt.id) }); }
    catch (error) { handlePrivateError(error); }
  };
  if (sessionAvailable === false) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} title={copy.receipt} theme={theme} /><CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /></View>;
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} title={copy.receipt} theme={theme} />
    <CommerceState body={copy.successBody} theme={theme} title={copy.successTitle} />
    <View style={styles.panel}><Summary label={copy.orderNumber} value={receipt.orderNumber} isRtl={isRtl} styles={styles} /><Summary label={copy.status} value={commerceStatusLabel(receipt.status, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.fulfillment} value={commerceStatusLabel(receipt.fulfillmentStatus, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.payment} value={`${commercePaymentMethodLabel(receipt.paymentMethod, copy)} · ${commerceStatusLabel(receipt.paymentStatus, locale)}`} isRtl={isRtl} styles={styles} /><Summary label={copy.total} value={formatCommerceMoney(receipt.grandTotal, receipt.currency, locale)} isRtl={isRtl} styles={styles} /><Text style={styles.muted}>{formatCommerceDate(receipt.createdAt, locale)}</Text></View>
    {receipt.items.map((item, index) => <View key={`${item.productName}-${index}`} style={styles.lineCard}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{item.productName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{item.variantTitle} · {item.quantity}</Text><Text style={styles.goldText}>{formatCommerceMoney(item.lineTotal, item.currency, locale)}</Text></View>)}
    {receipt.address ? <View style={styles.panel}><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.address}</Text><Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{receipt.address.recipientName} · {receipt.address.city} · {receipt.address.area} · {receipt.address.street}</Text></View> : null}
    <CommerceButton label={copy.viewOrder} onPress={() => void openOrder()} theme={theme} />
    <CommerceButton label={copy.orders} onPress={() => navigate({ kind: "orders" })} secondary theme={theme} />
    <CommerceButton label={copy.market} onPress={() => navigate({ kind: "market" })} secondary theme={theme} />
  </View>;
}

function OrdersScreen(props: CommonProps) {
  const { canGoBack, copy, goBack, handlePrivateError, isRtl, locale, navigate, onOpenAccount, sessionAvailable, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [orders, setOrders] = useState<CommerceOrderSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const load = async (append = false) => { setState("loading"); try { const result = await commerceApi.listOrders(append ? cursor ?? undefined : undefined); setOrders((current) => append ? [...current, ...result.data] : result.data); setCursor(result.pageInfo.nextCursor); setHasNext(result.pageInfo.hasNextPage); setState("ready"); } catch (error) { if (isUnauthorizedError(error)) { setOrders([]); setCursor(null); setHasNext(false); } setState("error"); handlePrivateError(error); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (id: string) => { try { navigate({ kind: "order", order: await commerceApi.getOrder(id) }); } catch (error) { setState("error"); handlePrivateError(error); } };
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={canGoBack ? goBack : undefined} title={copy.orders} theme={theme} />
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {sessionAvailable !== false && state === "loading" && !orders.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {sessionAvailable !== false && state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {sessionAvailable !== false && state === "ready" && !orders.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {sessionAvailable !== false ? orders.map((order) => <PremiumPressable accessibilityLabel={`${copy.orderNumber} ${order.orderNumber}`} accessibilityRole="button" key={order.id} onPress={() => void open(order.id)} style={styles.lineCard}><View style={[styles.between, isRtl && styles.rowRtl]}><View style={styles.flex}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{order.store.name}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{order.orderNumber} · {commerceStatusLabel(order.status, locale)}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{formatCommerceDate(order.createdAt, locale)}</Text></View><Text style={styles.goldText}>{formatCommerceMoney(order.grandTotal, order.currency, locale)}</Text></View></PremiumPressable>) : null}
    {sessionAvailable !== false && hasNext ? <CommerceButton label={copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
  </View>;
}

function OrderDetail(props: CommonProps & { order: CommerceOrderDetail }) {
  const { copy, goBack, handlePrivateError, isRtl, locale, onOpenAccount, order: initialOrder, sessionAvailable, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [order, setOrder] = useState(initialOrder);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cancellationAttemptRef = useRef<{ key: string; signature: string } | null>(null);
  const cancel = () => Alert.alert(copy.cancelOrder, copy.cancelReason, [{ text: copy.cancel, style: "cancel" }, { text: copy.confirm, style: "destructive", onPress: () => void submitCancellation() }]);
  const submitCancellation = async () => { const normalizedReason = reason.trim().replace(/\s+/g, " "); const expectedVersion = order.expectedVersion; if (normalizedReason.length < 2 || submitting || !expectedVersion) return; const attempt = resolveOrderCancellationAttempt(cancellationAttemptRef.current, { expectedVersion, orderId: order.id, reason: normalizedReason }, createUuid); cancellationAttemptRef.current = attempt; setSubmitting(true); try { setOrder(await commerceApi.cancelOrder(order.id, expectedVersion, normalizedReason, attempt.key)); cancellationAttemptRef.current = null; setNotice(copy.orderCancelled); } catch (error) { handlePrivateError(error); } finally { setSubmitting(false); } };
  if (sessionAvailable === false) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} title={copy.order} theme={theme} /><CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /></View>;
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.order} theme={theme} />
    <View style={styles.panel}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{order.store.name}</Text><Summary label={copy.orderNumber} value={order.orderNumber} isRtl={isRtl} styles={styles} /><Summary label={copy.status} value={commerceStatusLabel(order.status, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.fulfillment} value={commerceStatusLabel(order.fulfillmentStatus, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.payment} value={`${commercePaymentMethodLabel(order.paymentMethod, copy)} · ${commerceStatusLabel(order.paymentStatus, locale)}`} isRtl={isRtl} styles={styles} /><Summary label={copy.total} value={formatCommerceMoney(order.grandTotal, order.currency, locale)} isRtl={isRtl} styles={styles} /></View>
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.orderItems}</Text>
    {order.items.map((item, index) => <View key={`${item.productName}-${index}`} style={styles.lineCard}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{item.productName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{item.variantTitle} · {item.quantity}</Text><Text style={styles.goldText}>{formatCommerceMoney(item.lineTotal, item.currency, locale)}</Text></View>)}
    {order.address ? <View style={styles.panel}><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.address}</Text><Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{order.address.recipientName}</Text><Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{order.address.city} · {order.address.area} · {order.address.street}</Text></View> : null}
    {order.pickup ? <View style={styles.panel}><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.pickup}</Text>{order.pickup.address ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{order.pickup.address}</Text> : null}{order.pickup.instructions ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{order.pickup.instructions}</Text> : null}</View> : null}
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.orderHistory}</Text>
    {order.history.map((item, index) => <View key={`${item.createdAt}-${index}`} style={[styles.timeline, isRtl && styles.rowRtl]}><View style={styles.timelineDot} /><View style={styles.flex}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{commerceStatusLabel(item.newOrderStatus ?? item.newFulfillmentStatus ?? item.newPaymentStatus ?? "", locale)}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{formatCommerceDate(item.createdAt, locale)}</Text>{item.reason ? <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{item.reason}</Text> : null}</View></View>)}
    {canRenderCustomerCancellation(order) ? <View style={styles.panel}><TextInput accessibilityLabel={copy.cancelReason} maxLength={500} onChangeText={setReason} placeholder={copy.cancelReason} placeholderTextColor={theme.colors.mutedForeground} style={[styles.inputBox, isRtl ? styles.rtl : styles.ltr]} value={reason} /><CommerceButton danger disabled={reason.trim().length < 2 || submitting} label={copy.cancelOrder} onPress={cancel} theme={theme} /></View> : null}
  </View>;
}

function FavoritesScreen(props: CommonProps) {
  const { canGoBack, copy, favoriteProductIds, favoriteResources, favoriteStoreIds, goBack, isRtl, locale, openProduct, openStore, onOpenAccount, sessionAvailable, theme, toggleProductFavorite, toggleStoreFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stores, setStores] = useState<FavoriteStore[]>([]);
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [mode, setMode] = useState<"products" | "stores">("stores");
  const [storeCursor, setStoreCursor] = useState<string | null>(null);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [storeHasNext, setStoreHasNext] = useState(false);
  const [productHasNext, setProductHasNext] = useState(false);
  const { loadProducts, loadStores, productState, storeState } = favoriteResources;
  const refreshStores = useCallback(async () => {
    const result = await loadStores();
    if (!result) return;
    setStores(result.data);
    setStoreCursor(result.pageInfo.nextCursor);
    setStoreHasNext(result.pageInfo.hasNextPage);
  }, [loadStores]);
  const refreshProducts = useCallback(async () => {
    const result = await loadProducts();
    if (!result) return;
    setProducts(result.data);
    setProductCursor(result.pageInfo.nextCursor);
    setProductHasNext(result.pageInfo.hasNextPage);
  }, [loadProducts]);
  const loadMore = async () => {
    if (mode === "stores" && storeCursor) {
      const result = await loadStores(storeCursor);
      if (!result) return;
      setStores((current) => [...current, ...result.data]);
      setStoreCursor(result.pageInfo.nextCursor);
      setStoreHasNext(result.pageInfo.hasNextPage);
    } else if (mode === "products" && productCursor) {
      const result = await loadProducts(productCursor);
      if (!result) return;
      setProducts((current) => [...current, ...result.data]);
      setProductCursor(result.pageInfo.nextCursor);
      setProductHasNext(result.pageInfo.hasNextPage);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshStores();
      void refreshProducts();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshProducts, refreshStores]);
  const visibleStores = stores.filter((item) => favoriteStoreIds.has(item.store.id));
  const visibleProducts = products.filter((item) => favoriteProductIds.has(item.product.id));
  const state = mode === "stores" ? storeState : productState;
  const items = mode === "stores" ? visibleStores : visibleProducts;
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={canGoBack ? goBack : undefined} title={copy.favorites} theme={theme} />
    <View style={[styles.segment, isRtl && styles.rowRtl]}><Chip label={copy.favoriteStores} onPress={() => setMode("stores")} selected={mode === "stores"} theme={theme} /><Chip label={copy.favoriteProducts} onPress={() => setMode("products")} selected={mode === "products"} theme={theme} /></View>
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {sessionAvailable !== false && state === "loading" && !items.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {sessionAvailable !== false && state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void (mode === "stores" ? refreshStores() : refreshProducts())} theme={theme} title={copy.errorGeneric} /> : null}
    {sessionAvailable !== false && isConfirmedEmptyResource(state, Boolean(items.length)) ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {sessionAvailable !== false && mode === "stores" ? visibleStores.map(({ store }) => <StoreCard copy={copy} favorite isRtl={isRtl} key={store.id} locale={locale} onFavorite={() => void toggleStoreFavorite(store)} onPress={() => void openStore(store.slug)} store={store} theme={theme} />) : null}
    {sessionAvailable !== false && mode === "products" ? visibleProducts.map(({ product }) => <ProductCard copy={copy} favorite isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void toggleProductFavorite(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />) : null}
    {sessionAvailable !== false && (mode === "stores" ? storeHasNext : productHasNext) ? <CommerceButton disabled={state === "loading"} label={state === "loading" ? copy.loading : copy.loadMore} onPress={() => void loadMore()} secondary theme={theme} /> : null}
  </View>;
}

function AddressesScreen(props: CommonProps & { returnToCheckout: boolean }) {
  const { cart, copy, goBack, handlePrivateError, isRtl, onOpenAccount, returnToCheckout, sessionAvailable, setCheckoutDraft, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [addresses, setAddresses] = useState<CommerceAddress[]>([]);
  const [form, setForm] = useState<CommerceAddressInput>(EMPTY_ADDRESS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const load = useCallback(async () => { setState("loading"); try { setAddresses((await commerceApi.listAddresses()).data); setState("ready"); } catch (error) { if (isUnauthorizedError(error)) setAddresses([]); setState("error"); handlePrivateError(error); } }, [handlePrivateError]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const valid = form.recipientName.trim() && /^\+?[0-9][0-9 ()-]{5,28}$/.test(form.phone.trim()) && form.city.trim() && form.area.trim() && form.street.trim() && form.additionalDetails.trim();
  const save = async () => {
    if (!valid) return;
    try {
      const saved = editingId
        ? await commerceApi.updateAddress(editingId, form)
        : await commerceApi.createAddress(form);
      setForm(EMPTY_ADDRESS);
      setEditingId(null);
      if (returnToCheckout && cart) {
        setCheckoutDraft((current) => ({
          ...checkoutDraftForCart(current, cart),
          addressId: saved.id,
          attempt: null,
          fulfillmentMethod: "STORE_DELIVERY",
        }));
        goBack();
        return;
      }
      await load();
    } catch (error) { if (isUnauthorizedError(error)) setAddresses([]); setState("error"); handlePrivateError(error); }
  };
  const mutateAddress = async (operation: () => Promise<unknown>) => {
    try { await operation(); await load(); }
    catch (error) { if (isUnauthorizedError(error)) setAddresses([]); setState("error"); handlePrivateError(error); }
  };
  const edit = (address: CommerceAddress) => { setEditingId(address.id); setForm({ additionalDetails: address.additionalDetails, area: address.area, city: address.city, landmark: address.landmark, phone: address.phone, recipientName: address.recipientName, street: address.street }); };
  if (sessionAvailable === false) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} title={copy.addresses} theme={theme} /><CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /></View>;
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.addresses} theme={theme} />
    {state === "loading" && !addresses.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {addresses.map((address) => <View key={address.id} style={[styles.addressChoice, address.isDefault && styles.selected]}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{address.recipientName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{address.phone}\n{address.city} · {address.area} · {address.street}</Text><View style={[styles.wrap, isRtl && styles.rowRtl]}><CommerceButton label={copy.updateAddress} onPress={() => edit(address)} secondary theme={theme} />{!address.isDefault ? <CommerceButton label={copy.setDefault} onPress={() => void mutateAddress(() => commerceApi.setDefaultAddress(address.id))} secondary theme={theme} /> : null}<CommerceButton danger label={copy.remove} onPress={() => void mutateAddress(() => commerceApi.deleteAddress(address.id))} secondary theme={theme} /></View></View>)}
    <View style={styles.panel}><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{editingId ? copy.updateAddress : copy.addAddress}</Text><AddressField label={copy.recipientName} name="recipientName" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} /><AddressField label={copy.phone} name="phone" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} keyboardType="phone-pad" /><AddressField label={copy.city} name="city" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} /><AddressField label={copy.area} name="area" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} /><AddressField label={copy.street} name="street" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} /><AddressField label={copy.addressDetails} name="additionalDetails" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} multiline /><AddressField label={copy.landmark} name="landmark" setForm={setForm} form={form} isRtl={isRtl} styles={styles} theme={theme} /><CommerceButton disabled={!valid} label={editingId ? copy.updateAddress : copy.createAddress} onPress={() => void save()} theme={theme} /></View>
  </KeyboardAvoidingView>;
}

function AddressField({ form, isRtl, keyboardType, label, multiline, name, setForm, styles, theme }: { form: CommerceAddressInput; isRtl: boolean; keyboardType?: "phone-pad"; label: string; multiline?: boolean; name: keyof CommerceAddressInput; setForm: (value: CommerceAddressInput) => void; styles: ReturnType<typeof createStyles>; theme: MobileTheme }) {
  return <TextInput accessibilityLabel={label} keyboardType={keyboardType} maxLength={name === "additionalDetails" ? 500 : name === "landmark" ? 240 : 160} multiline={multiline} onChangeText={(value) => setForm({ ...form, [name]: value })} placeholder={label} placeholderTextColor={theme.colors.mutedForeground} style={[multiline ? styles.textArea : styles.inputBox, isRtl ? styles.rtl : styles.ltr]} value={String(form[name] ?? "")} />;
}

function QuantityControl({ copy, quantity, setQuantity, theme }: { copy: CommerceCopy; quantity: number; setQuantity: (quantity: number) => void; theme: MobileTheme }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.quantityControl}><PremiumPressable accessibilityLabel={copy.decreaseQuantity} accessibilityRole="button" disabled={quantity <= 1} onPress={() => setQuantity(Math.max(1, quantity - 1))} style={styles.quantityButton}><Text style={styles.quantityText}>−</Text></PremiumPressable><Text style={styles.quantityValue}>{quantity}</Text><PremiumPressable accessibilityLabel={copy.increaseQuantity} accessibilityRole="button" disabled={quantity >= 99} onPress={() => setQuantity(Math.min(99, quantity + 1))} style={styles.quantityButton}><Text style={styles.quantityText}>+</Text></PremiumPressable></View>;
}

function Chip({ disabled = false, label, onPress, selected, theme }: { disabled?: boolean; label: string; onPress: () => void; selected: boolean; theme: MobileTheme }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <PremiumPressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></PremiumPressable>;
}

function Summary({ isRtl, label, styles, value }: { isRtl: boolean; label: string; styles: ReturnType<typeof createStyles>; value: string }) {
  return <View style={[styles.between, isRtl && styles.rowRtl]}><Text style={styles.muted}>{label}</Text><Text style={[styles.summaryValue, isRtl ? styles.rtl : styles.ltr]}>{value}</Text></View>;
}

function isCartStoreConflict(error: unknown) {
  return error instanceof MobileApiRequestError && (
    error.code === "CART_STORE_CONFLICT" || error.details?.kind === "CART_STORE_CONFLICT"
  );
}

function isCartVersionConflict(error: unknown) {
  return error instanceof MobileApiRequestError && error.code === "CART_VERSION_CONFLICT";
}

function isUnauthorizedError(error: unknown) {
  return error instanceof MobileApiRequestError && error.status === 401;
}

function messageForError(error: unknown, copy: CommerceCopy) {
  if (error instanceof MobileApiRequestError) {
    if (error.status === 401) return copy.sessionRequired;
    if (error.status === 429) return copy.rateLimited;
    if (error.status === 404) return copy.unavailableBody;
    if (error.code === "CART_VERSION_CONFLICT") return copy.cartUnavailable;
    if (error.code === "ORDER_NOT_CANCELLABLE") return copy.notAvailable;
  }
  return copy.errorGeneric;
}

function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    addressChoice: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 7, padding: 15 },
    between: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
    body: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 14, lineHeight: 23 },
    chip: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 8 },
    chipSelected: { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.gold },
    chipText: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 12 },
    chipTextSelected: { color: theme.colors.gold, fontFamily: FONT.uiSemiBold },
    danger: { color: theme.colors.danger, fontFamily: FONT.uiSemiBold, fontSize: 13 },
    detailImage: { borderRadius: 24, height: 280, width: "100%" },
    dialog: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.goldSoft, borderRadius: 26, borderWidth: 1, gap: 14, marginHorizontal: 24, padding: 22, width: "88%" },
    dialogTitle: { color: theme.colors.foreground, fontFamily: FONT.kufiBold, fontSize: 20 },
    disabled: { opacity: 0.42 },
    flex: { flex: 1 },
    goldText: { color: theme.colors.gold, fontFamily: FONT.uiSemiBold, fontSize: 14 },
    heroImage: { borderRadius: 24, height: 190, width: "100%" },
    input: { color: theme.colors.foreground, flex: 1, fontFamily: FONT.uiRegular, fontSize: 15, minHeight: 52 },
    inputBox: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 16, borderWidth: 1, color: theme.colors.foreground, fontFamily: FONT.uiRegular, fontSize: 14, minHeight: 52, paddingHorizontal: 14 },
    label: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 14 },
    lineCard: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, gap: 12, padding: 15 },
    lineTitle: { color: theme.colors.foreground, fontFamily: FONT.uiSemiBold, fontSize: 16, lineHeight: 24 },
    lineTop: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
    ltr: { textAlign: "left", writingDirection: "ltr" },
    mediaFallback: { alignItems: "center", backgroundColor: theme.colors.heroMuted, borderRadius: 24, height: 220, justifyContent: "center" },
    mediaIcon: { height: 48, tintColor: theme.colors.gold, width: 48 },
    modalRoot: { alignItems: "center", backgroundColor: theme.colors.overlay, flex: 1, justifyContent: "center" },
    muted: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 13, lineHeight: 20 },
    notice: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning, borderRadius: 16, borderWidth: 1, marginTop: 4, padding: 12 },
    noticeText: { color: theme.colors.warning, fontFamily: FONT.uiSemiBold, fontSize: 13, textAlign: "center" },
    panel: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 24, borderWidth: 1, gap: 13, padding: 17 },
    quantityButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
    quantityControl: { alignItems: "center", backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", minHeight: 44 },
    quantityRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    quantityText: { color: theme.colors.gold, fontFamily: FONT.uiSemiBold, fontSize: 22 },
    quantityValue: { color: theme.colors.foreground, fontFamily: FONT.uiSemiBold, fontSize: 15, minWidth: 34, textAlign: "center" },
    rowRtl: { flexDirection: "row-reverse" },
    rtl: { textAlign: "right", writingDirection: "rtl" },
    screen: { paddingBottom: 26, paddingHorizontal: 16, paddingTop: 12 },
    search: { alignItems: "center", backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 15 },
    searchIcon: { height: 22, tintColor: theme.colors.gold, width: 22 },
    sectionTitle: { color: theme.colors.foreground, fontFamily: FONT.uiSemiBold, fontSize: 18, lineHeight: 28 },
    segment: { flexDirection: "row", gap: 9 },
    selected: { borderColor: theme.colors.gold },
    stack: { gap: 15 },
    summaryValue: { color: theme.colors.foreground, flex: 1, fontFamily: FONT.uiSemiBold, fontSize: 14 },
    textArea: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, color: theme.colors.foreground, fontFamily: FONT.uiRegular, fontSize: 14, minHeight: 100, padding: 14, textAlignVertical: "top" },
    thumbnail: { borderRadius: 14, height: 80, width: 80 },
    timeline: { flexDirection: "row", gap: 12, paddingHorizontal: 8 },
    timelineDot: { backgroundColor: theme.colors.gold, borderRadius: 6, height: 12, marginTop: 6, width: 12 },
    title: { color: theme.colors.foreground, fontFamily: FONT.kufiBold, fontSize: 21, lineHeight: 32 },
    warning: { color: theme.colors.warning, fontFamily: FONT.uiSemiBold, fontSize: 12 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  });
}
