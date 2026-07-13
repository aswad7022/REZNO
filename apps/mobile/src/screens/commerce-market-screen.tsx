import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  canRenderCustomerCancellation,
  isLatestRequest,
  optimisticSet,
  resolveCheckoutAttempt,
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
  CommerceOrderDetail,
  CommerceOrderSummary,
  CommerceProduct,
  CommerceProductDetail,
  CommerceReceipt,
  CommerceStore,
  CommerceVariant,
  FavoriteProduct,
  FavoriteStore,
  FulfillmentMethod,
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

type LoadState = "error" | "idle" | "loading" | "ready";
type PendingReplacement = { incomingStore?: string; quantity: number; variantId: string } | null;

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
  const [cart, setCart] = useState<CommerceCart | null>(null);
  const [sessionAvailable, setSessionAvailable] = useState<boolean | null>(null);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<Set<string>>(new Set());
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement>(null);

  const navigate = useCallback((next: Route) => {
    setHistory((current) => [...current, route]);
    setRoute(next);
    setNotice(null);
  }, [route]);

  const goBack = useCallback(() => {
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
  }, [history.length, onExit]);

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
      setSessionAvailable(false);
      setNotice(copy.sessionRequired);
      return;
    }
    setNotice(messageForError(error, copy));
  }, [copy]);

  const refreshPrivateContext = useCallback(async () => {
    try {
      const [nextCart, stores, products] = await Promise.all([
        commerceApi.getCart(),
        commerceApi.listFavoriteStores(),
        commerceApi.listFavoriteProducts(),
      ]);
      setCart(nextCart);
      setFavoriteStoreIds(new Set(stores.data.map((item) => item.store.id)));
      setFavoriteProductIds(new Set(products.data.map((item) => item.product.id)));
      setSessionAvailable(true);
    } catch (error) {
      if (error instanceof MobileApiRequestError && error.status === 401) setSessionAvailable(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refreshPrivateContext(), 0);
    return () => clearTimeout(timer);
  }, [refreshPrivateContext]);

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
    const wasFavorite = favoriteStoreIds.has(store.id);
    setFavoriteStoreIds(optimisticSet(favoriteStoreIds, store.id, !wasFavorite));
    try {
      if (wasFavorite) await commerceApi.removeFavoriteStore(store.id);
      else await commerceApi.addFavoriteStore(store.id);
      setSessionAvailable(true);
      return true;
    } catch (error) {
      setFavoriteStoreIds(optimisticSet(favoriteStoreIds, store.id, wasFavorite));
      handlePrivateError(error);
      return false;
    }
  };

  const toggleProductFavorite = async (product: CommerceProduct) => {
    if (sessionAvailable === false) {
      handlePrivateError(new MobileApiRequestError("", 401));
      return false;
    }
    const wasFavorite = favoriteProductIds.has(product.id);
    setFavoriteProductIds(optimisticSet(favoriteProductIds, product.id, !wasFavorite));
    try {
      if (wasFavorite) await commerceApi.removeFavoriteProduct(product.id);
      else await commerceApi.addFavoriteProduct(product.id);
      setSessionAvailable(true);
      return true;
    } catch (error) {
      setFavoriteProductIds(optimisticSet(favoriteProductIds, product.id, wasFavorite));
      handlePrivateError(error);
      return false;
    }
  };

  const addToCart = async (variant: CommerceVariant, quantity: number, incomingStore?: string) => {
    setNotice(null);
    try {
      const next = await commerceApi.addCartItem(variant.id, quantity, cart?.version);
      setCart(next);
      setSessionAvailable(true);
      navigate({ kind: "cart" });
    } catch (error) {
      if (isCartStoreConflict(error) && cart) {
        setPendingReplacement({ incomingStore, quantity, variantId: variant.id });
        return;
      }
      if (isCartVersionConflict(error)) await refreshCartAfterConflict(setCart, handlePrivateError);
      handlePrivateError(error);
    }
  };

  const replaceCart = async () => {
    if (!pendingReplacement || !cart) return;
    try {
      const next = await commerceApi.replaceCart(
        cart.id, cart.version, pendingReplacement.variantId, pendingReplacement.quantity,
      );
      setCart(next);
      setPendingReplacement(null);
      navigate({ kind: "cart" });
    } catch (error) {
      setPendingReplacement(null);
      if (isCartVersionConflict(error)) await refreshCartAfterConflict(setCart, handlePrivateError);
      handlePrivateError(error);
    }
  };

  const common = {
    cart,
    copy,
    favoriteProductIds,
    favoriteStoreIds,
    goBack,
    isRtl,
    locale,
    navigate,
    notice,
    onOpenAccount,
    openProduct,
    openStore,
    sessionAvailable,
    setCart,
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
  cart: CommerceCart | null;
  copy: CommerceCopy;
  favoriteProductIds: Set<string>;
  favoriteStoreIds: Set<string>;
  goBack: () => void;
  isRtl: boolean;
  locale: MobileLocale;
  navigate: (route: Route) => void;
  notice: string | null;
  onOpenAccount: () => void;
  openProduct: (storeSlug: string, productSlug: string) => Promise<void>;
  openStore: (storeSlug: string) => Promise<void>;
  sessionAvailable: boolean | null;
  setCart: (cart: CommerceCart | null) => void;
  setNotice: (notice: string | null) => void;
  theme: MobileTheme;
  toggleProductFavorite: (product: CommerceProduct) => Promise<boolean>;
  toggleStoreFavorite: (store: CommerceStore) => Promise<boolean>;
};

function MarketHome(props: CommonProps) {
  const { cart, copy, favoriteProductIds, favoriteStoreIds, isRtl, locale, navigate, openProduct, openStore, theme, toggleProductFavorite, toggleStoreFavorite } = props;
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
      <CommerceHeader cartQuantity={cart?.totalQuantity} copy={copy} isRtl={isRtl} onCart={() => navigate({ kind: "cart" })} title={copy.market} theme={theme} />
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
      {state === "ready" && mode === "products" && products.length === 0 ? <CommerceState body={copy.emptyBody} theme={theme} title={query ? copy.noResults : copy.emptyTitle} /> : null}
      {state === "ready" && mode === "stores" && stores.length === 0 ? <CommerceState body={copy.emptyBody} theme={theme} title={query ? copy.noResults : copy.emptyTitle} /> : null}
      {mode === "products" ? products.map((product) => (
        <ProductCard copy={copy} favorite={favoriteProductIds.has(product.id)} isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void toggleProductFavorite(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />
      )) : stores.map((store) => (
        <StoreCard copy={copy} favorite={favoriteStoreIds.has(store.id)} isRtl={isRtl} key={store.id} locale={locale} onFavorite={() => void toggleStoreFavorite(store)} onPress={() => void openStore(store.slug)} store={store} theme={theme} />
      ))}
      {hasNext ? <CommerceButton disabled={state === "loading"} label={state === "loading" ? copy.loading : copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
    </View>
  );
}

function StoreDetail(props: CommonProps & { store: CommerceStore }) {
  const { cart, copy, favoriteProductIds, favoriteStoreIds, goBack, isRtl, locale, navigate, openProduct, store, theme, toggleProductFavorite, toggleStoreFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
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
    <CommerceHeader cartQuantity={cart?.totalQuantity} copy={copy} isRtl={isRtl} onBack={goBack} onCart={() => navigate({ kind: "cart" })} title={store.name} theme={theme} />
    {store.coverImageUrl ? <Image alt={store.name} source={{ uri: store.coverImageUrl }} style={styles.heroImage} /> : null}
    <View style={styles.panel}>
      <View style={[styles.between, isRtl && styles.rowRtl]}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{store.name}</Text><IconButton active={favoriteStoreIds.has(store.id)} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={() => void toggleStoreFavorite(store)} theme={theme} /></View>
      {store.description ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{store.description}</Text> : null}
      <Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{copy.minimumOrder}: {formatCommerceMoney(store.minimumOrderValue, store.currency, locale)}</Text>
      {store.delivery.enabled ? <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.delivery} · {formatCommerceMoney(store.delivery.fee, store.currency, locale)}</Text> : null}
      {store.pickup.enabled && store.pickup.instructions ? <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.pickup}: {store.pickup.instructions}</Text> : null}
    </View>
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.products}</Text>
    {state === "loading" && !products.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {state === "ready" && !products.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {products.map((product) => <ProductCard copy={copy} favorite={favoriteProductIds.has(product.id)} isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void toggleProductFavorite(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />)}
    {hasNext ? <CommerceButton label={copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
  </View>;
}

function ProductDetail(props: CommonProps & { addToCart: (variant: CommerceVariant, quantity: number, incomingStore?: string) => Promise<void>; product: CommerceProductDetail }) {
  const { addToCart, cart, copy, favoriteProductIds, goBack, isRtl, locale, navigate, product, theme, toggleProductFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const selectable = product.variants.filter((variant) => variant.inStock);
  const automatic = product.variants.length === 1 || (selectable.length === 1 && selectable[0]?.isDefault);
  const [variantId, setVariantId] = useState<string | null>(automatic ? selectable[0]?.id ?? null : null);
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? null;
  return <View style={styles.stack}>
    <CommerceHeader cartQuantity={cart?.totalQuantity} copy={copy} isRtl={isRtl} onBack={goBack} onCart={() => navigate({ kind: "cart" })} title={product.name} theme={theme} />
    {product.media[0]?.url ? <Image alt={product.media[0].altText ?? product.name} source={{ uri: product.media[0].url }} style={styles.detailImage} /> : <View style={styles.mediaFallback}><Image alt="" source={COMMERCE_ICONS.catalog} style={styles.mediaIcon} /></View>}
    <View style={styles.panel}>
      <View style={[styles.between, isRtl && styles.rowRtl]}><View style={styles.flex}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{product.name}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{product.store.name} · {product.category.name}</Text></View><IconButton active={favoriteProductIds.has(product.id)} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={() => void toggleProductFavorite(product)} theme={theme} /></View>
      {product.description ? <Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{product.description}</Text> : null}
      <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.selectVariant}</Text>
      <View style={[styles.wrap, isRtl && styles.rowRtl]}>{product.variants.map((variant) => <Chip disabled={!variant.inStock} key={variant.id} label={`${variant.title} · ${formatCommerceMoney(variant.price, variant.currency, locale)}`} onPress={() => setVariantId(variant.id)} selected={variantId === variant.id} theme={theme} />)}</View>
      {selected?.compareAtPrice ? <Text style={styles.muted}>{formatCommerceMoney(selected.compareAtPrice, selected.currency, locale)}</Text> : null}
      <View style={[styles.quantityRow, isRtl && styles.rowRtl]}><Text style={styles.label}>{copy.quantity}</Text><QuantityControl copy={copy} quantity={quantity} setQuantity={setQuantity} theme={theme} /></View>
      <CommerceButton disabled={!selected?.inStock} label={selected ? copy.addToCart : copy.selectVariant} onPress={() => selected ? void addToCart(selected, quantity, product.store.name) : undefined} theme={theme} />
    </View>
  </View>;
}

function CartScreen(props: CommonProps) {
  const { cart, copy, goBack, isRtl, locale, navigate, onOpenAccount, sessionAvailable, setCart, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mutate = async (operation: () => Promise<CommerceCart | null>) => {
    setNotice(null);
    try { setCart(await operation()); }
    catch (error) {
      if (isCartVersionConflict(error)) await refreshCartAfterConflict(setCart, (value) => setNotice(messageForError(value, copy)));
      setNotice(messageForError(error, copy));
    }
  };
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.cart} theme={theme} />
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {sessionAvailable !== false && !cart ? <CommerceState body={copy.cartEmpty} buttonLabel={copy.continueShopping} onPress={() => navigate({ kind: "market" })} theme={theme} title={copy.cart} /> : null}
    {cart ? <>
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
  const { cart, copy, goBack, isRtl, locale, navigate, setCart, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [addresses, setAddresses] = useState<CommerceAddress[]>([]);
  const [storeDetails, setStoreDetails] = useState<CommerceStore | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>(cart?.store ? "CUSTOMER_PICKUP" : "CUSTOMER_PICKUP");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attempt = useRef<{ key: string; signature: string } | null>(null);
  useEffect(() => {
    if (!cart) return;
    void Promise.all([commerceApi.getCart(), commerceApi.listAddresses(), commerceApi.getStore(cart.store.slug)]).then(([currentCart, result, store]) => {
      setCart(currentCart);
      setAddresses(result.data);
      setAddressId(result.data.find((item) => item.isDefault)?.id ?? result.data[0]?.id ?? null);
      setStoreDetails(store);
      if (!store.pickup.enabled && store.delivery.enabled) setFulfillment("STORE_DELIVERY");
    }).catch((error) => setNotice(messageForError(error, copy)));
  }, [cart?.store.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cart) return <View style={styles.stack}><CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.checkout} theme={theme} /><CommerceState body={copy.cartEmpty} theme={theme} title={copy.cartEmpty} /></View>;
  const checkoutInput = { addressId: fulfillment === "STORE_DELIVERY" ? addressId : null, cartId: cart.id, cartVersion: cart.version, customerInstructions: instructions.trim() || null, fulfillmentMethod: fulfillment };
  const submit = async () => {
    if (fulfillment === "STORE_DELIVERY" && !addressId) return setNotice(copy.addressRequired);
    if (submitting) return;
    setSubmitting(true); setNotice(null);
    attempt.current = resolveCheckoutAttempt(attempt.current, checkoutInput, createUuid);
    try {
      const receipt = await commerceApi.checkout(checkoutInput, attempt.current.key);
      attempt.current = null;
      setCart(null);
      navigate({ kind: "receipt", receipt });
    } catch (error) { setNotice(messageForError(error, copy)); }
    finally { setSubmitting(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.checkout} theme={theme} />
    <View style={styles.panel}><Text style={[styles.title, isRtl ? styles.rtl : styles.ltr]}>{cart.store.name}</Text><Text style={[styles.goldText, isRtl ? styles.rtl : styles.ltr]}>{copy.subtotal}: {formatCommerceMoney(cart.informationalSubtotal, cart.currency, locale)}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.checkoutHint}</Text></View>
    <Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.fulfillment}</Text>
    <View style={[styles.segment, isRtl && styles.rowRtl]}><Chip disabled={storeDetails ? !storeDetails.pickup.enabled : false} label={copy.pickup} onPress={() => { setFulfillment("CUSTOMER_PICKUP"); attempt.current = null; }} selected={fulfillment === "CUSTOMER_PICKUP"} theme={theme} /><Chip disabled={storeDetails ? !storeDetails.delivery.enabled : false} label={copy.delivery} onPress={() => { setFulfillment("STORE_DELIVERY"); attempt.current = null; }} selected={fulfillment === "STORE_DELIVERY"} theme={theme} /></View>
    {fulfillment === "STORE_DELIVERY" ? <><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.selectAddress}</Text>{addresses.map((address) => <PremiumPressable accessibilityRole="radio" accessibilityState={{ checked: address.id === addressId }} key={address.id} onPress={() => { setAddressId(address.id); attempt.current = null; }} style={[styles.addressChoice, address.id === addressId && styles.selected]}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{address.recipientName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{address.city} · {address.area} · {address.street}</Text></PremiumPressable>)}<CommerceButton label={copy.addAddress} onPress={() => navigate({ kind: "addresses", returnToCheckout: true })} secondary theme={theme} /></> : null}
    <TextInput accessibilityLabel={copy.customerInstructions} multiline maxLength={1000} onChangeText={(value) => { setInstructions(value); attempt.current = null; }} placeholder={copy.customerInstructions} placeholderTextColor={theme.colors.mutedForeground} style={[styles.textArea, isRtl ? styles.rtl : styles.ltr]} value={instructions} />
    <Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{copy.payment}: {fulfillment === "STORE_DELIVERY" ? copy.cashOnDelivery : copy.payAtPickup}</Text>
    <CommerceButton disabled={submitting || !cart.availability || (fulfillment === "STORE_DELIVERY" && !addressId)} label={submitting ? copy.loading : copy.confirm} onPress={() => void submit()} theme={theme} />
  </KeyboardAvoidingView>;
}

function ReceiptScreen(props: CommonProps & { receipt: CommerceReceipt }) {
  const { copy, isRtl, locale, navigate, receipt, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} title={copy.receipt} theme={theme} />
    <CommerceState body={copy.successBody} theme={theme} title={copy.successTitle} />
    <View style={styles.panel}><Summary label={copy.orderNumber} value={receipt.orderNumber} isRtl={isRtl} styles={styles} /><Summary label={copy.status} value={commerceStatusLabel(receipt.status, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.fulfillment} value={commerceStatusLabel(receipt.fulfillmentStatus, locale)} isRtl={isRtl} styles={styles} /><Summary label={copy.payment} value={`${commercePaymentMethodLabel(receipt.paymentMethod, copy)} · ${commerceStatusLabel(receipt.paymentStatus, locale)}`} isRtl={isRtl} styles={styles} /><Summary label={copy.total} value={formatCommerceMoney(receipt.grandTotal, receipt.currency, locale)} isRtl={isRtl} styles={styles} /><Text style={styles.muted}>{formatCommerceDate(receipt.createdAt, locale)}</Text></View>
    {receipt.items.map((item, index) => <View key={`${item.productName}-${index}`} style={styles.lineCard}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{item.productName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{item.variantTitle} · {item.quantity}</Text><Text style={styles.goldText}>{formatCommerceMoney(item.lineTotal, item.currency, locale)}</Text></View>)}
    {receipt.address ? <View style={styles.panel}><Text style={[styles.sectionTitle, isRtl ? styles.rtl : styles.ltr]}>{copy.address}</Text><Text style={[styles.body, isRtl ? styles.rtl : styles.ltr]}>{receipt.address.recipientName} · {receipt.address.city} · {receipt.address.area} · {receipt.address.street}</Text></View> : null}
    <CommerceButton label={copy.viewOrder} onPress={() => void commerceApi.getOrder(receipt.id).then((order) => navigate({ kind: "order", order }))} theme={theme} />
    <CommerceButton label={copy.orders} onPress={() => navigate({ kind: "orders" })} secondary theme={theme} />
    <CommerceButton label={copy.market} onPress={() => navigate({ kind: "market" })} secondary theme={theme} />
  </View>;
}

function OrdersScreen(props: CommonProps) {
  const { copy, goBack, isRtl, locale, navigate, onOpenAccount, sessionAvailable, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [orders, setOrders] = useState<CommerceOrderSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const load = async (append = false) => { setState("loading"); try { const result = await commerceApi.listOrders(append ? cursor ?? undefined : undefined); setOrders((current) => append ? [...current, ...result.data] : result.data); setCursor(result.pageInfo.nextCursor); setHasNext(result.pageInfo.hasNextPage); setState("ready"); } catch { setState("error"); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (id: string) => { try { navigate({ kind: "order", order: await commerceApi.getOrder(id) }); } catch { setState("error"); } };
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.orders} theme={theme} />
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {state === "loading" && !orders.length ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {state === "ready" && !orders.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {orders.map((order) => <PremiumPressable accessibilityLabel={`${copy.orderNumber} ${order.orderNumber}`} accessibilityRole="button" key={order.id} onPress={() => void open(order.id)} style={styles.lineCard}><View style={[styles.between, isRtl && styles.rowRtl]}><View style={styles.flex}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{order.store.name}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{order.orderNumber} · {commerceStatusLabel(order.status, locale)}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{formatCommerceDate(order.createdAt, locale)}</Text></View><Text style={styles.goldText}>{formatCommerceMoney(order.grandTotal, order.currency, locale)}</Text></View></PremiumPressable>)}
    {hasNext ? <CommerceButton label={copy.loadMore} onPress={() => void load(true)} secondary theme={theme} /> : null}
  </View>;
}

function OrderDetail(props: CommonProps & { order: CommerceOrderDetail }) {
  const { copy, goBack, isRtl, locale, order: initialOrder, setNotice, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [order, setOrder] = useState(initialOrder);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cancel = () => Alert.alert(copy.cancelOrder, copy.cancelReason, [{ text: copy.cancel, style: "cancel" }, { text: copy.confirm, style: "destructive", onPress: () => void submitCancellation() }]);
  const submitCancellation = async () => { if (reason.trim().length < 2 || submitting) return; setSubmitting(true); try { setOrder(await commerceApi.cancelOrder(order.id, reason.trim())); setNotice(copy.orderCancelled); } catch (error) { setNotice(messageForError(error, copy)); } finally { setSubmitting(false); } };
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
  const { copy, goBack, isRtl, locale, openProduct, openStore, onOpenAccount, sessionAvailable, theme, toggleProductFavorite, toggleStoreFavorite } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stores, setStores] = useState<FavoriteStore[]>([]);
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [mode, setMode] = useState<"products" | "stores">("stores");
  const [state, setState] = useState<LoadState>("loading");
  const [storeCursor, setStoreCursor] = useState<string | null>(null);
  const [productCursor, setProductCursor] = useState<string | null>(null);
  const [storeHasNext, setStoreHasNext] = useState(false);
  const [productHasNext, setProductHasNext] = useState(false);
  const load = async () => { setState("loading"); try { const [storeResult, productResult] = await Promise.all([commerceApi.listFavoriteStores(), commerceApi.listFavoriteProducts()]); setStores(storeResult.data); setProducts(productResult.data); setStoreCursor(storeResult.pageInfo.nextCursor); setProductCursor(productResult.pageInfo.nextCursor); setStoreHasNext(storeResult.pageInfo.hasNextPage); setProductHasNext(productResult.pageInfo.hasNextPage); setState("ready"); } catch { setState("error"); } };
  const loadMore = async () => { setState("loading"); try { if (mode === "stores" && storeCursor) { const result = await commerceApi.listFavoriteStores(storeCursor); setStores((current) => [...current, ...result.data]); setStoreCursor(result.pageInfo.nextCursor); setStoreHasNext(result.pageInfo.hasNextPage); } else if (mode === "products" && productCursor) { const result = await commerceApi.listFavoriteProducts(productCursor); setProducts((current) => [...current, ...result.data]); setProductCursor(result.pageInfo.nextCursor); setProductHasNext(result.pageInfo.hasNextPage); } setState("ready"); } catch { setState("error"); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  const removeStore = async (store: CommerceStore) => { if (await toggleStoreFavorite(store)) setStores((current) => current.filter((item) => item.store.id !== store.id)); };
  const removeProduct = async (product: CommerceProduct) => { if (await toggleProductFavorite(product)) setProducts((current) => current.filter((item) => item.product.id !== product.id)); };
  return <View style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.favorites} theme={theme} />
    <View style={[styles.segment, isRtl && styles.rowRtl]}><Chip label={copy.favoriteStores} onPress={() => setMode("stores")} selected={mode === "stores"} theme={theme} /><Chip label={copy.favoriteProducts} onPress={() => setMode("products")} selected={mode === "products"} theme={theme} /></View>
    {sessionAvailable === false ? <CommerceState body={copy.sessionRequired} buttonLabel={copy.retry} onPress={onOpenAccount} theme={theme} title={copy.sessionRequired} /> : null}
    {state === "loading" ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {state === "error" ? <CommerceState buttonLabel={copy.retry} onPress={() => void load()} theme={theme} title={copy.errorGeneric} /> : null}
    {state === "ready" && mode === "stores" && !stores.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {state === "ready" && mode === "products" && !products.length ? <CommerceState body={copy.emptyBody} theme={theme} title={copy.emptyTitle} /> : null}
    {mode === "stores" ? stores.map(({ store }) => <StoreCard copy={copy} favorite isRtl={isRtl} key={store.id} locale={locale} onFavorite={() => void removeStore(store)} onPress={() => void openStore(store.slug)} store={store} theme={theme} />) : products.map(({ product }) => <ProductCard copy={copy} favorite isRtl={isRtl} key={product.id} locale={locale} onFavorite={() => void removeProduct(product)} onPress={() => void openProduct(product.storeSlug, product.productSlug)} product={product} theme={theme} />)}
    {(mode === "stores" ? storeHasNext : productHasNext) ? <CommerceButton disabled={state === "loading"} label={state === "loading" ? copy.loading : copy.loadMore} onPress={() => void loadMore()} secondary theme={theme} /> : null}
  </View>;
}

function AddressesScreen(props: CommonProps & { returnToCheckout: boolean }) {
  const { copy, goBack, isRtl, returnToCheckout, theme } = props;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [addresses, setAddresses] = useState<CommerceAddress[]>([]);
  const [form, setForm] = useState<CommerceAddressInput>(EMPTY_ADDRESS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const load = async () => { setState("loading"); try { setAddresses((await commerceApi.listAddresses()).data); setState("ready"); } catch { setState("error"); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  const valid = form.recipientName.trim() && /^\+?[0-9][0-9 ()-]{5,28}$/.test(form.phone.trim()) && form.city.trim() && form.area.trim() && form.street.trim() && form.additionalDetails.trim();
  const save = async () => { if (!valid) return; try { if (editingId) await commerceApi.updateAddress(editingId, form); else await commerceApi.createAddress(form); setForm(EMPTY_ADDRESS); setEditingId(null); await load(); if (returnToCheckout) goBack(); } catch { setState("error"); } };
  const edit = (address: CommerceAddress) => { setEditingId(address.id); setForm({ additionalDetails: address.additionalDetails, area: address.area, city: address.city, landmark: address.landmark, phone: address.phone, recipientName: address.recipientName, street: address.street }); };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.stack}>
    <CommerceHeader copy={copy} isRtl={isRtl} onBack={goBack} title={copy.addresses} theme={theme} />
    {state === "loading" ? <CommerceState title={copy.loading} theme={theme} /> : null}
    {addresses.map((address) => <View key={address.id} style={[styles.addressChoice, address.isDefault && styles.selected]}><Text style={[styles.lineTitle, isRtl ? styles.rtl : styles.ltr]}>{address.recipientName}</Text><Text style={[styles.muted, isRtl ? styles.rtl : styles.ltr]}>{address.phone}\n{address.city} · {address.area} · {address.street}</Text><View style={[styles.wrap, isRtl && styles.rowRtl]}><CommerceButton label={copy.updateAddress} onPress={() => edit(address)} secondary theme={theme} />{!address.isDefault ? <CommerceButton label={copy.setDefault} onPress={() => void commerceApi.setDefaultAddress(address.id).then(load)} secondary theme={theme} /> : null}<CommerceButton danger label={copy.remove} onPress={() => void commerceApi.deleteAddress(address.id).then(load)} secondary theme={theme} /></View></View>)}
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

async function refreshCartAfterConflict(setCart: (cart: CommerceCart | null) => void, onError: (error: unknown) => void) {
  try { setCart(await commerceApi.getCart()); } catch (error) { onError(error); }
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
