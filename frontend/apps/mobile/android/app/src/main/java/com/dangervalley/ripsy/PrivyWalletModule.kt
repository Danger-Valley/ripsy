package com.dangervalley.ripsy

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import io.privy.auth.AuthState
import io.privy.auth.PrivyUser
import io.privy.logging.PrivyLogLevel
import io.privy.sdk.Privy
import io.privy.sdk.PrivyConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class PrivyWalletModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val configured = BuildConfig.PRIVY_APP_ID.isNotBlank() && BuildConfig.PRIVY_CLIENT_ID.isNotBlank()
  private val privy: Privy? by lazy {
    if (!configured) null else Privy.init(
      reactApplicationContext.applicationContext,
      PrivyConfig(
        appId = BuildConfig.PRIVY_APP_ID,
        appClientId = BuildConfig.PRIVY_CLIENT_ID,
        logLevel = PrivyLogLevel.NONE,
      ),
    )
  }

  override fun getName() = "PrivyWallet"

  @ReactMethod
  fun getState(promise: Promise) = launch(promise) {
    stateMap(privy?.getAuthState())
  }

  @ReactMethod
  fun sendEmailCode(email: String, promise: Promise) = launch(promise) {
    requireConfigured().email.sendCode(email).getOrThrow()
    null
  }

  @ReactMethod
  fun loginWithEmailCode(email: String, code: String, promise: Promise) = launch(promise) {
    requireConfigured().email.loginWithCode(code, email).getOrThrow()
    stateMap(requireConfigured().getAuthState())
  }

  @ReactMethod
  fun createWallet(promise: Promise) = launch(promise) {
    val user = authenticatedUser()
    if (user.embeddedSolanaWallets.isEmpty()) user.createSolanaWallet().getOrThrow()
    stateMap(requireConfigured().getAuthState())
  }

  @ReactMethod
  fun logout(promise: Promise) = launch(promise) {
    requireConfigured().logout()
    stateMap(requireConfigured().getAuthState())
  }

  @ReactMethod
  fun signMessage(message: String, buyer: String, promise: Promise) = launch(promise) {
    val wallet = authenticatedUser().embeddedSolanaWallets.firstOrNull { it.address == buyer }
      ?: throw IllegalStateException("Reconnect the embedded wallet selected for your army.")
    wallet.provider.signMessage(message.toByteArray(Charsets.UTF_8)).getOrThrow()
  }

  @ReactMethod
  fun signTransaction(transactionBase64: String, buyer: String, promise: Promise) = launch(promise) {
    val wallet = authenticatedUser().embeddedSolanaWallets.firstOrNull { it.address == buyer }
      ?: throw IllegalStateException("Reconnect the embedded wallet selected for this purchase.")
    val transaction = try {
      Base64.decode(transactionBase64, Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      throw IllegalArgumentException("The purchase transaction is invalid.")
    }
    wallet.provider.signTransaction(transaction).getOrThrow()
  }

  private suspend fun authenticatedUser(): PrivyUser {
    return (requireConfigured().getAuthState() as? AuthState.Authenticated)?.user
      ?: throw IllegalStateException("Sign in to your embedded wallet first.")
  }

  private fun requireConfigured(): Privy = privy
    ?: throw IllegalStateException("Privy is not configured for this app build.")

  private fun stateMap(authState: AuthState?): WritableMap {
    val result = Arguments.createMap()
    result.putBoolean("configured", configured)
    when (authState) {
      is AuthState.Authenticated -> {
        result.putString("status", "authenticated")
        result.putString("userId", authState.user.id)
        result.putString("address", authState.user.embeddedSolanaWallets.firstOrNull()?.address)
      }
      is AuthState.AuthenticatedUnverified -> {
        result.putString("status", "authenticated-unverified")
        result.putNull("userId")
        result.putNull("address")
      }
      is AuthState.NotReady -> {
        result.putString("status", "authenticated-unverified")
        result.putNull("userId")
        result.putNull("address")
      }
      else -> {
        result.putString("status", if (configured) "unauthenticated" else "unavailable")
        result.putNull("userId")
        result.putNull("address")
      }
    }
    return result
  }

  private fun launch(promise: Promise, block: suspend () -> Any?) {
    scope.launch {
      try {
        promise.resolve(block())
      } catch (cause: Throwable) {
        promise.reject("PRIVY_WALLET_ERROR", safeMessage(cause), cause)
      }
    }
  }

  private fun safeMessage(cause: Throwable): String = when (cause) {
    is IllegalStateException, is IllegalArgumentException -> cause.message ?: "Wallet request failed."
    else -> "Wallet request failed. Please try again."
  }

  override fun invalidate() {
    scope.cancel()
    super.invalidate()
  }
}
