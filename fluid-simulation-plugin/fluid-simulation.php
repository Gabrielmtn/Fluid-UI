<?php
/**
 * Plugin Name: Fluid Simulation
 * Plugin URI: https://github.com/Gabrielmtn/Fluid-UI
 * Description: Interactive WebGL2-based fluid simulation with advanced controls, layer management, and recording capabilities.
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://github.com/Gabrielmtn
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: fluid-simulation
 * Domain Path: /languages
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('FLUID_SIM_VERSION', '1.0.0');
define('FLUID_SIM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('FLUID_SIM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('FLUID_SIM_PLUGIN_FILE', __FILE__);

/**
 * Main Fluid Simulation Plugin Class
 */
class Fluid_Simulation_Plugin {

    /**
     * Instance of this class
     */
    private static $instance = null;

    /**
     * Get instance of the plugin
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));

        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_shortcode('fluid_simulation', array($this, 'render_shortcode'));

        // AJAX hooks for saving settings
        add_action('wp_ajax_fluid_sim_save_palette', array($this, 'save_palette'));
        add_action('wp_ajax_fluid_sim_get_palette', array($this, 'get_palette'));
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_menu_page(
            __('Fluid Simulation', 'fluid-simulation'),
            __('Fluid Simulation', 'fluid-simulation'),
            'manage_options',
            'fluid-simulation',
            array($this, 'render_admin_page'),
            'dashicons-admin-customizer',
            30
        );
    }

    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        // Only load on our admin page
        if ('toplevel_page_fluid-simulation' !== $hook) {
            return;
        }

        // Enqueue CSS
        wp_enqueue_style(
            'fluid-simulation-css',
            FLUID_SIM_PLUGIN_URL . 'assets/css/fluid-simulation.css',
            array(),
            FLUID_SIM_VERSION
        );

        // Enqueue JavaScript
        wp_enqueue_script(
            'fluid-simulation-js',
            FLUID_SIM_PLUGIN_URL . 'assets/js/fluid-simulation.js',
            array(),
            FLUID_SIM_VERSION,
            true
        );

        // Enqueue media uploader
        wp_enqueue_media();

        // Pass data to JavaScript
        wp_localize_script('fluid-simulation-js', 'fluidSimData', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('fluid_sim_nonce'),
            'pluginUrl' => FLUID_SIM_PLUGIN_URL
        ));
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_frontend_assets() {
        // Enqueue CSS
        wp_enqueue_style(
            'fluid-simulation-css',
            FLUID_SIM_PLUGIN_URL . 'assets/css/fluid-simulation.css',
            array(),
            FLUID_SIM_VERSION
        );

        // Enqueue JavaScript
        wp_enqueue_script(
            'fluid-simulation-js',
            FLUID_SIM_PLUGIN_URL . 'assets/js/fluid-simulation.js',
            array(),
            FLUID_SIM_VERSION,
            true
        );

        // Pass data to JavaScript
        wp_localize_script('fluid-simulation-js', 'fluidSimData', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('fluid_sim_nonce'),
            'pluginUrl' => FLUID_SIM_PLUGIN_URL
        ));
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        include FLUID_SIM_PLUGIN_DIR . 'admin/templates/admin-page.php';
    }

    /**
     * Render shortcode
     */
    public function render_shortcode($atts) {
        $atts = shortcode_atts(array(
            'width' => '800',
            'height' => '600',
        ), $atts, 'fluid_simulation');

        ob_start();
        include FLUID_SIM_PLUGIN_DIR . 'includes/shortcode-template.php';
        return ob_get_clean();
    }

    /**
     * AJAX: Save palette data
     */
    public function save_palette() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $palette = isset($_POST['palette']) ? sanitize_text_field($_POST['palette']) : '';
        update_option('fluid_sim_palette', $palette);

        wp_send_json_success();
    }

    /**
     * AJAX: Get palette data
     */
    public function get_palette() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        $palette = get_option('fluid_sim_palette', '');
        wp_send_json_success($palette);
    }
}

// Initialize the plugin
function fluid_simulation_init() {
    return Fluid_Simulation_Plugin::get_instance();
}

// Start the plugin
add_action('plugins_loaded', 'fluid_simulation_init');

// Activation hook
register_activation_hook(__FILE__, 'fluid_simulation_activate');
function fluid_simulation_activate() {
    // Set default options
    add_option('fluid_sim_palette', '');
    flush_rewrite_rules();
}

// Deactivation hook
register_deactivation_hook(__FILE__, 'fluid_simulation_deactivate');
function fluid_simulation_deactivate() {
    flush_rewrite_rules();
}
