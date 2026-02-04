package pl.xsus.custommenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

import java.util.ArrayList;
import java.util.List;

/**
 * Handler zdarzeń ekranu - modyfikuje menu główne
 */
@OnlyIn(Dist.CLIENT)
public class MenuEventHandler {

    @SubscribeEvent
    public void onScreenInit(ScreenEvent.Init.Post event) {
        Screen screen = event.getScreen();

        // Tylko dla ekranu tytułowego (menu główne)
        if (!(screen instanceof TitleScreen)) {
            return;
        }

        XsusMenuMod.LOGGER.info("XsusMenuMod: Modyfikowanie menu głównego...");

        // Znajdź przyciski do usunięcia
        List<Button> buttonsToRemove = new ArrayList<>();

        for (var widget : event.getListenersList()) {
            if (widget instanceof Button button) {
                String buttonText = button.getMessage().getString().toLowerCase();

                // Usuń przyciski Singleplayer, Multiplayer, Realms
                if (buttonText.contains("singleplayer") ||
                    buttonText.contains("pojedynczy") ||
                    buttonText.contains("multiplayer") ||
                    buttonText.contains("wieloosobowy") ||
                    buttonText.contains("realms") ||
                    buttonText.contains("minecraft realms")) {
                    buttonsToRemove.add(button);
                }
            }
        }

        // Usuń znalezione przyciski
        for (Button button : buttonsToRemove) {
            event.removeListener(button);
        }

        // Dodaj przycisk "Połącz z serwerem"
        int centerX = screen.width / 2;
        int buttonY = screen.height / 4 + 48; // Pozycja pierwszego przycisku

        String buttonText = "Połącz z " + XsusMenuMod.SERVER_NAME;

        Button connectButton = Button.builder(
            Component.literal(buttonText),
            btn -> connectToServer()
        )
        .bounds(centerX - 100, buttonY, 200, 20)
        .build();

        event.addListener(connectButton);

        XsusMenuMod.LOGGER.info("XsusMenuMod: Menu zmodyfikowane pomyślnie! Serwer: {}:{}",
            XsusMenuMod.SERVER_IP, XsusMenuMod.SERVER_PORT);
    }

    /**
     * Łączy z serwerem (IP pobrane z konfiguracji panelu)
     */
    private void connectToServer() {
        Minecraft mc = Minecraft.getInstance();

        String serverAddress = XsusMenuMod.SERVER_IP + ":" + XsusMenuMod.SERVER_PORT;

        XsusMenuMod.LOGGER.info("XsusMenuMod: Łączenie z serwerem: " + serverAddress);

        // Utwórz dane serwera
        ServerData serverData = new ServerData(
            XsusMenuMod.SERVER_NAME,
            serverAddress,
            ServerData.Type.OTHER
        );

        // Połącz z serwerem
        ConnectToServerHelper.connect(mc, serverData);
    }
}
